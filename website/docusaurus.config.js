module.exports={
  "title": "Deploys.app",
  "tagline": "Designed for developers 👨‍💻, Built for business 💰",
  "url": "https://deploys-app.github.io",
  "baseUrl": "/docs/",
  "organizationName": "deploys-app",
  "projectName": "docs",
  "scripts": [
    "https://buttons.github.io/buttons.js"
  ],
  "favicon": "img/icon.png",
  "customFields": {
    "users": [
      {
        "caption": "YelloTalk",
        "image": "/img/customer/yellotalk.png",
        "infoLink": "https://yellotalk.co",
        "pinned": true
      },
      {
        "caption": "PilloCast",
        "image": "/img/customer/pillowcast.png",
        "infoLink": "https://pillowcast.net",
        "pinned": true
      }
    ],
    "defaultVersionShown": "1.0"
  },
  "onBrokenLinks": "log",
  "onBrokenMarkdownLinks": "log",
  "presets": [
    [
      "@docusaurus/preset-classic",
      {
        "docs": {
          "homePageId": "doc1",
          "showLastUpdateAuthor": true,
          "showLastUpdateTime": true,
          "sidebarPath": "../website-old/sidebars.json"
        },
        "blog": {
          "path": "blog"
        },
        "theme": {
          "customCss": "../src/css/customTheme.css"
        }
      }
    ]
  ],
  "plugins": [],
  "themeConfig": {
    "navbar": {
      "title": "Deploys.app",
      "logo": {
        "src": "img/icon.png"
      },
      "items": [
        {
          "to": "docs/",
          "label": "Getting Started",
          "position": "left"
        },
        {
          "to": "docs/doc2",
          "label": "Example",
          "position": "left"
        },
        {
          "to": "docs/doc4",
          "label": "API",
          "position": "left"
        },
        {
          "to": "/help",
          "label": "Support",
          "position": "left"
        }
      ]
    },
    "image": "img/undraw_online.svg",
    "footer": {
      "links": [],
      "copyright": "© 2021 Moon Rhythm Co., Ltd. All rights reserved.",
      "logo": {
        "src": "img/icon.png"
      }
    }
  }
}