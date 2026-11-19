import { Link } from 'react-router-dom';

export default function PublicTop({ other }) {
  return (
    <div className="pub-top">
      <div className="logo">SBH</div>
      <div><b>SBH 2027</b><small>BPS Kabupaten Berau</small></div>
      <div className="sp" />
      {other && <Link to={other.to}>{other.label}</Link>}
    </div>
  );
}
