const fs = require('fs').promises;

/**
 * Directory should be organized as root/$org/$board.json, optionally with me.json in the root
 */
const INPUT_DIRECTORY =  `~/Desktop/trello`;
const OUTPUT_DIRECTORY = `~/Desktop/trellout`;

//TODO attachment downloads, checklists, labels, duedates, what else?

(async function() {
    try {

        await fs.rmdir(OUTPUT_DIRECTORY, {recursive: true})
        await fs.mkdir(OUTPUT_DIRECTORY)

        const orgs = (await fs.readdir(INPUT_DIRECTORY)).filter(x => x !== 'me.json')

        const allBoards = await Promise.all(orgs.map(o => {
            return fs.readdir(`${INPUT_DIRECTORY}/${o}`).then(boards => boards.map(b => ({org: o, board: b})))
        }))

        console.log(allBoards.flatMap(x => x))
        const boards = await Promise.all(allBoards.flatMap(x => x).map(b =>
            fs.readFile(`${INPUT_DIRECTORY}/${b.org}/${b.board}`)
                .then(f => f.toString())
                .then(f => JSON.parse(f))
                .then(f => ({board: b, content: getBoard(f) }))
        ))

        await Promise.all(boards.map(writeBoard))
    } catch (ex) {
        console.error(ex)
    }

}());

const writeBoard = async ({board, content}) => {
    await Promise.all(content.lists.map(l => writeList(board, l)))
}

const writeList = async (board, list) => {
    //TODO consider including the list index for sort position. How often is it meaningful?
    const listPath = `${OUTPUT_DIRECTORY}/${board.org}/${list.boardSlug}/${list.closed ? '.' : ''}${list.name}`;
    console.log('Writing list', listPath)
    await fs.mkdir(listPath, { recursive: true });
    if (!list.cards.length) {
        return
    }
    const listGeneralPath = `${listPath}/${'0'.repeat(Math.floor(Math.log10(list.cards.length) + 1))}-general`;
    await fs.writeFile(listGeneralPath, list.desc ? list.desc : '')
    for (let i = 0; i < list.cards.length; i++) {
        const c = list.cards[i];

        await fs.appendFile(listGeneralPath, `### ${c.name}${c.closed ? ' (Archived)' : ''}\n`)
        await fs.appendFile(listGeneralPath, `_Migrated from Trello, last modified: ${c.modified}_\n`)
        if (c.body || c.links.length) {
            await fs.appendFile(listGeneralPath, `\nSee [${c.slug}](./${c.slug})\n`)
        }
        await fs.appendFile(listGeneralPath, '\n-------------------\n\n')

        if (c.body || c.links.length || c.checklists.length) {
            const cardPath = `${listPath}/${c.slug}`
            await fs.appendFile(cardPath, `_Migrated from Trello, last modified: ${c.modified}_\n\n`)

            if (c.body) {
                await fs.appendFile(cardPath, c.body)
            }

            if (c.checklistIds.length !== c.checklists.length) {
                throw new Error('wat')
            }

            for (let j = 0; j < c.checklists.length; j++){
                const chlist = c.checklists[j];
                await fs.appendFile(cardPath, `\n\n# ${chlist.name}\n\n`)
                for (let k = 0; k < chlist.items.length; k++) {
                    const item = chlist.items[k];
                    if (item.due) {
                        throw new Error('Unhandled due date')
                    }
                    await fs.appendFile(cardPath, `[${item.state === 'complete' ? 'x' : ''}] ${item.name}\n`)
                }
            }


            if (c.links.length) {
                await fs.appendFile(cardPath, '\n\n\n# Links:\n')
                for (let j = 0; j < c.links.length; j++) {
                    const link = c.links[j]
                    if (link.external) {
                        await fs.appendFile(cardPath, `* [${link.name}](${link.url})`)
                    } else {
                        await fs.appendFile(cardPath, `* [${link.name}](./${link.name})`)
                        console.warn('Need to download', `${cardPath}/${c.slug}/${link.name}`, link.url)
                        // const stream = require('fs').createWriteStream(`${OUTPUT}/${board.org}/${list.boardSlug}/${link.name}`)
                        // require('https').get(link.url, res => res.pipe(stream))
                    }

                }

            }


        }


    }
}

const writeCard = async (card) => {

}

const getBoard = board => {
    const slug = board.url.substr(board.url.lastIndexOf('/') + 1);
    const lists = board.lists.map(l => ({
        id: l.id,
        name: l.name.replace(/\//g, '_'),
        pos: l.pos,
        closed: l.closed,
        cards: [],
        boardSlug: slug,
    })).sort((a, b) => a.pos > b.pos ? 1 : -1)

    const cards = getCards(board.cards);


    cards.forEach(c => {

        c.checklistIds.forEach(cid => {
            const list = board.checklists.find(checklist => checklist.id === cid);
            c.checklists.push({
                name: list.name,
                pos: list.pos,
                items: list.checkItems.map(item => ({
                    state: item.state,
                    name: item.name,
                    pos: item.pos,
                    due: item.due
                })).sort((a, b) => a.pos > b.pos ? 1 : -1)
            })

            c.checklists = c.checklists.sort((a, b) => a.pos > b.pos ? 1 : -1)
        })

        const list = lists.find(l => l.id === c.listId)
        list.cards.push(c)
    })

    lists.forEach(l => {
        l.cards = l.cards.map((c, i) => ({
            ...c,
            slug: `${c.closed ? '.' : ''}${(i + 1).toString().padStart(Math.log10(l.cards.length) + 1, '0')}${c.nonUniqueSlug}`
        }))
    })


    return {
        name: board.name,
        desc: board.desc,
        slug,
        lists
    }
}

const getCards = (cards) => {
    return cards.map(c => {
        const urlLastPart = c.url.substr(c.url.lastIndexOf('/') + 1);
        //remove the card id, instead I'll use the pos index
        const nonUniqueSlug = urlLastPart.substr(urlLastPart.indexOf('-'))
        return {
            name: c.name,
            nonUniqueSlug,
            closed: c.closed,
            body: c.desc,
            pos: c.pos,
            listId: c.idList,
            checklistIds: c.idChecklists,
            checklists: [],
            modified: c.dateLastActivity,
            links: c.attachments.map(a => ({name: a.name, url: a.url, external: !a.isUpload})) //there's also a pos and mime type?
        }
    }).sort((a, b) => a.pos > b.pos ? 1 : -1)
}
