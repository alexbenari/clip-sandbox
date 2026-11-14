export class WindowsFileNameValidity {
  static readonly #forbiddenCharacter = /[<>:"/\\|?*\u0000-\u001f]/;
  static readonly #reservedDeviceName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  isLegalWindowsFileName(name: string): boolean {
    return name.length > 0
      && !name.startsWith(' ')
      && !name.endsWith(' ')
      && !name.endsWith('.')
      && !WindowsFileNameValidity.#forbiddenCharacter.test(name)
      && !this.#namesDevice(name);
  }

  // Windows still opens the device when spaces or an extension follow its name.
  #namesDevice(name: string): boolean {
    const base = name.split('.', 1)[0].replace(/ +$/, '');
    return WindowsFileNameValidity.#reservedDeviceName.test(base);
  }
}
