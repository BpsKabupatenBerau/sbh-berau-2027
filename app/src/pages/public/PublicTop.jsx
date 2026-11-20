import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui';

export default function PublicTop() {
  return (
    <div className="pub-top">
      <div className="logo">SPKRT</div>
      <div><b>SPKRT 2027</b><small>BPS Kabupaten Berau</small></div>
      <div className="sp" />
      <Link to="/" className="pub-login"><Icon name="login" size={18} /> Masuk</Link>
    </div>
  );
}
