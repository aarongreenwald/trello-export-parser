# trello-export-parser
Parse Trello json exports and write to plain text files

# Usage

1. Download each board's json export to a local directory, and organize the files as $dir/$org/$board.json, optionally with me.json in the $dir. 
2. Create a `.env` file with two variables: Set the `INPUT_DIRECTORY` to be $dir, and the `OUTPUT_DIRECTORY` to be anywhere else.
3. `npm run parse`
4. Go do whatever you want. 

