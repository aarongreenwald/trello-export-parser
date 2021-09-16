const fs = require('fs').promises;

const DIRECTORY =  `/home/aaron/Desktop/trello`;
const OUTPUT = `/home/aaron/Desktop/trellout`;

//TODO attachment downloads, checklists, labels, duedates, what else?

(async function() {
    try {

        await fs.rmdir(OUTPUT, {recursive: true})
        await fs.mkdir(OUTPUT)

        const orgs = (await fs.readdir(DIRECTORY)).filter(x => x !== 'me.json')

        const allBoards = await Promise.all(orgs.map(o => {
            return fs.readdir(`${DIRECTORY}/${o}`).then(boards => boards.map(b => ({org: o, board: b})))
        }))

        console.log(allBoards.flatMap(x => x))
        const boards = await Promise.all(allBoards.flatMap(x => x).map(b =>
            fs.readFile(`${DIRECTORY}/${b.org}/${b.board}`)
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
    console.log('writing', board.org, list.boardSlug)

    const listPath = `${OUTPUT}/${board.org}/${list.boardSlug}/${list.closed ? '.' : ''}${list.name}`;
    await fs.mkdir(`${OUTPUT}/${board.org}/${list.boardSlug}`, { recursive: true });
    await fs.writeFile(listPath, list.desc ? list.desc : '')
    for (let i = 0; i < list.cards.length; i++) {
        const c = list.cards[i];
        await fs.appendFile(listPath, c.name)
        if (c.body) {
            await fs.appendFile(listPath, '\n')
            await fs.appendFile(listPath, '~~~~~~~~~~~~~~~~~~~~\n')
            //TODO determine if card should be extracted to its own file based on depth of content
            //How to mix card files with list files?? When should lists be files and when should they be directories?
            //consider making all cards files, adding a "NoContent" tag and ordering the files
            await fs.appendFile(listPath, c.body)
        }

        if (c.links.length) {
            await fs.appendFile(listPath, '\nLinks:\n')
            for (let j = 0; j < c.links.length; j++) {
                const link = c.links[j]
                if (link.external) {
                    await fs.appendFile(listPath, `* [${link.name}](${link.url})`)
                } else {
                    await fs.appendFile(listPath, `* [${link.name}](./${link.name})`)
                    console.warn('Need to download', `${OUTPUT}/${board.org}/${list.boardSlug}/${list.name}/${c.slug}/${link.name}`, link.url)
                    // const stream = require('fs').createWriteStream(`${OUTPUT}/${board.org}/${list.boardSlug}/${link.name}`)
                    // require('https').get(link.url, res => res.pipe(stream))
                }

            }
            await fs.appendFile(listPath, '~~~~~~~~~~~~~~~~~~~~\n')
        }

        await fs.appendFile(listPath, '\n\n\n')
    }
}

const getBoard = board => {
    const slug = board.url.substr(board.url.lastIndexOf('/') + 1);
    const lists = board.lists.map(l => ({
        id: l.id,
        name: l.name.replace(/\//g, '_'),
        pos: l.pos,
        closed: l.closed,
        cards: [],
        boardSlug: slug
    })).sort((a, b) => a.pos > b.pos ? 1 : -1)

    const cards = getCards(board.cards);

    cards.forEach(c => {
        const list = lists.find(l => l.id === c.listId)
        list.cards.push(c)
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
        return {
            name: c.name,
            slug: c.url.substr(c.url.lastIndexOf('/') + 1),
            closed: c.closed,
            body: c.desc,
            pos: c.pos,
            listId: c.idList,
            links: c.attachments.map(a => ({name: a.name, url: a.url, external: !a.isUpload})) //there's also a pos and mime type?
        }
    }).sort((a, b) => a.pos > b.pos ? 1 : -1)
}
