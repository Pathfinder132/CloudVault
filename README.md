# CloudVault

CloudVault is a lightweight, locally hosted file-management mini-project built with **Node.js, Express and vanilla JavaScript**. It provides a simple browser interface for organizing files in a personal workspace.

## Features

- Session-based sign-in
- Upload up to 10 files per request (50 MB per file)
- Create folders and browse nested directories
- Download, rename and delete files/folders
- Search the current folder
- Preview common images, PDFs and text files
- Basic storage usage indicator
- Per-account storage directories
- Responsive dashboard UI

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm start
```

Open **http://localhost:3000**.

### Demo login

| Username | Password |
|---|---|
| `admin` | `CloudVault@123` |

Change these demo credentials before using the application outside a local demonstration. You can override them when the initial account file is created:

```powershell
$env:DEMO_USERNAME="yourusername"
$env:DEMO_PASSWORD="choose-a-strong-password"
$env:SESSION_SECRET="use-a-long-random-secret"
npm start
```

The initial account is created in `data/users/accounts.json`. If you change the environment credentials after that file exists, the existing account remains unchanged. To reset the demo account, stop the server, back up any data you need, remove `data/users/accounts.json`, set the desired environment variables, and restart.

## Data storage

Uploaded files are stored locally under `data/uploads/`, separated by a hashed account directory. The application does not upload data to a cloud provider.

## Project structure

```text
CloudVault/
├── data/
│   ├── uploads/          # User files (ignored by Git)
│   └── users/             # Local account data (ignored by Git)
├── public/
│   ├── css/styles.css
│   ├── js/app.js
│   └── index.html
├── server.js              # Express API and local file operations
├── package.json
└── README.md
```

## Security and scope notes

This project is intended for local development and demonstration, not direct public internet deployment. Before production use, add HTTPS and secure cookies, a persistent session store, CSRF protection, rate limiting, account-management flows, stricter upload/content policies, backups and operational monitoring. The default session secret is for local demonstration only. The demo account is not a substitute for a complete user-registration and password-reset system.

The storage indicator is a simple per-user byte count against a configurable-looking 1 GB display limit; it is not a hard disk quota. Search currently filters the folder being viewed. Preview is limited to image, PDF and text MIME types.

## Acknowledgements and project provenance

CloudVault is an independently written educational implementation informed by the general concept of self-hosted file management. It was developed as a smaller Node.js application and does **not** include copied FileGator source files.

The project that motivated this exercise is [FileGator](https://github.com/filegator/filegator), an open-source multi-user file manager distributed under the MIT License. Thanks to the FileGator maintainers and contributors for publishing that project. CloudVault is not affiliated with or endorsed by FileGator.

## License

Original CloudVault source code in this repository is released under the MIT License. See [LICENSE](LICENSE). Third-party dependencies remain under their respective licenses.
