import { Plane } from 'lucide-react';

export default function Navbar({ user, onLogout }) {
  return (
    <nav className="navbar">
      <a className="brand" href="#available-flights" aria-label="SkyWings home">
        <Plane size={28} color="#38bdf8" />
        <span>SkyWings Flight Portal</span>
      </a>
      <div className="nav-links">
          <a href="#available-flights">Available Flights</a>
          <a href="#booking-details">Booking Details</a>
            <span className="nav-user">{user?.full_name}</span>
          <button className="nav-refresh" type="button" onClick={onLogout}>Log out</button>
      </div>
    </nav>
  );
}
