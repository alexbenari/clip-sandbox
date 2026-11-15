const { pathToFileURL } = require('url');

// The address names the file's version, so a file replaced under the same name is not shown from the
// renderer's media cache of the previous one.
class MediaAddresses {
  address(absolutePath, lastModifiedMs) {
    return `${pathToFileURL(absolutePath).href}?modified=${Math.round(lastModifiedMs)}`;
  }
}

module.exports = { MediaAddresses };
