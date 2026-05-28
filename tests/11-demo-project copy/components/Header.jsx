import React from 'react';

function Header() {
  return (
    <header className="demo-header">
      <div className="brand-block">
        <div className="brand-mark">N</div>
        <div>
          <div className="brand-title">No Code UI Demo</div>
          <div className="brand-subtitle">Small test project</div>
        </div>
      </div>

      <nav className="demo-nav">
        <a href="#overview">Overview</a>
        <a href="#blocks">Blocks</a>
        <a href="#styles">Styles</a>
      </nav>
    </header>
  );
}

export default Header;
