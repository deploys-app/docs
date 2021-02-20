/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const React = require('react')

class Footer extends React.Component {
  docUrl(doc) {
    const baseUrl = this.props.config.baseUrl
    const docsUrl = this.props.config.docsUrl
    const docsPart = `${docsUrl ? `${docsUrl}/` : ''}`
    return `${baseUrl}${docsPart}${doc}`
  }

  render() {
    return (
      <footer className="nav-footer" id="footer">
        <section className="sitemap">
          <a href={this.props.config.baseUrl} className="nav-home">
            {this.props.config.footerIcon && (
              <img
                src={this.props.config.baseUrl + this.props.config.footerIcon}
                alt={this.props.config.title}
                width="66"
                height="58"
              />
            )}
          </a>
          <div>
            <h5>Docs</h5>
            <a href={this.docUrl('doc1.html')}>Getting Started</a>
            <a href={this.docUrl('doc2.html')}>User Guides</a>
            <a href={this.docUrl('doc3.html')}>API Reference</a>
          </div>
          <div>
            <h5>Community</h5>
            <a href={`${this.props.config.baseUrl}users`}>User Showcase</a>

            <a href="https://discordapp.com/" target="_blank" rel="noreferrer noopener">
              Acoshift's Discord
            </a>
            <a href="https://groups.google.com/u/1/a/deploys.app/g/community" target="_blank" rel="noreferrer noopener">
              Google Group
            </a>
          </div>
          <div>
            <h5>Learn &amp; Explore</h5>
            <a href="https://acoshift.me" target="_blank" rel="noreferrer noopener">
              Acoshift's Blog
            </a>
            <a href="https://github.com/moonrhythm" target="_blank" rel="noreferrer noopener">
              Moonrhythm Github
            </a>
            <a
              href={`https://twitter.com/acoshift`}
              target="_blank"
              rel="noreferrer noopener"
              className="twitter-follow-button"
            >
              Follow @acoshft
            </a>
            <div className="social">
              <a
                className="github-button"
                href="https://github.com/moonrhythm/hime"
                data-icon="octicon-star"
                data-count-href="/moonrhythm/hime/stargazers"
                data-show-count="true"
                data-count-aria-label="# stargazers on GitHub"
                aria-label="Star this project on GitHub"
              >
                Star
              </a>
            </div>
          </div>
        </section>

        <a href="https://www.moonrhythm.io/" target="_blank" rel="noreferrer noopener" className="fbOpenSource">
          <img
            src={`${this.props.config.baseUrl}img/moonrhythm-logo.svg`}
            alt="Moonrhythm Logo"
            width="170"
            height="170"
          />
        </a>
        <section className="copyright">{this.props.config.copyright}</section>
      </footer>
    )
  }
}

module.exports = Footer
