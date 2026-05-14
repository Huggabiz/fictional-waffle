import './VersionBadge.css';

export function VersionBadge() {
  return (
    <span className="version-badge" title="App version">
      v{__APP_VERSION__}
    </span>
  );
}
