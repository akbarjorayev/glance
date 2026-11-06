// Opens a file in the app the system uses for it, such as the image viewer.
// Every OS difference in opening files lives in this file.
const OPEN_COMMANDS = {
  win32: (file) => ['rundll32', ['url.dll,FileProtocolHandler', file]],
  darwin: (file) => ['open', [file]],
};
const openOnLinux = (file) => ['xdg-open', [file]];

export class FileOpener {
  #platform;
  #start;

  // `start(command, args)` starts the command and lets it run on its own.
  constructor({ platform, start }) {
    this.#platform = platform;
    this.#start = start;
  }

  open(file) {
    const [command, args] = (OPEN_COMMANDS[this.#platform] ?? openOnLinux)(file);
    this.#start(command, args);
  }
}
