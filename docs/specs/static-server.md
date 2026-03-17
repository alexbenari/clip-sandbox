# Static Server Recommendation

## Summary

For a bundled static-file server, the recommended choice is `miniserve`.

It is the best fit for this app because it is:

- open source,
- cross-platform,
- distributed as a single binary,
- easy to bundle with an installer,
- simpler than a full web server stack.

## Recommendation

Bundle `miniserve` with the app installer and launch it as a child process on `localhost` only.

Recommended launch shape:

```powershell
miniserve-win.exe -i 127.0.0.1 -i ::1 -p 8787 --index index.html <site-dir>
```

If the app uses client-side routing:

```powershell
miniserve-win.exe -i 127.0.0.1 -i ::1 -p 8787 --spa --index index.html <site-dir>
```

## Why `miniserve`

`miniserve` is a small, self-contained CLI static server with official Windows binaries and a permissive MIT license.

That makes it a strong packaging fit:

1. no dependency on Python, Node, IIS, or a developer toolchain,
2. no need to implement and maintain a custom HTTP server,
3. same operational shape on Windows, macOS, and Linux,
4. low integration complexity for a local packaged app.


## When To Choose Something Else

Choose `Static Web Server` instead if you later need:

- a richer config model,
- service-oriented deployment,
- more advanced server behavior than simple local static hosting.

Do not choose Caddy for this use case unless the app later needs broader web-server features. It is capable, but heavier than necessary for a bundled local static host.

## Sources

- `miniserve` repository: <https://github.com/svenstaro/miniserve>
- `Static Web Server` repository: <https://github.com/static-web-server/static-web-server>
- Caddy static file docs: <https://caddyserver.com/docs/quick-starts/static-files>
