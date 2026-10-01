import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
const formatRupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const rowDetails = row => {
  if (row === 1) return { tier: 'Front row', price: 750, description: 'Extra legroom, front cabin' };
  if ([10, 11].includes(row)) return { tier: 'Exit row', price: 500, description: 'Extra legroom, exit row' };
  return { tier: 'Standard', price: 0, description: 'Standard legroom' };
};

export default function SeatSelection({ flight, onContinue, onBack }) {
  const [seats, setSeats] = useState([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passengerCount, setPassengerCount] = useState(1);
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    let active = true;
    axios.get(`http://localhost:5000/api/flights/${flight.flight_id}/seats`)
      .then(response => { if (active) setSeats(response.data); })
      .catch(requestError => { if (active) setError(requestError.response?.data?.error || 'Could not load the seat map.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [flight.flight_id]);

  const seatByNumber = useMemo(() => new Map(seats.map(seat => [seat.seat_number, seat])), [seats]);
  const rowNumbers = useMemo(() => [...new Set(seats.map(seat => Number(seat.seat_number.slice(1))))].sort((a, b) => a - b), [seats]);
  const selectedSeats = seats.filter(seat => selectedSeatIds.includes(seat.seat_id)).map(seat => ({ ...seat, ...rowDetails(Number(seat.seat_number.slice(1))) }));
  const toggleSeat = seatId => {
    setSelectionError('');
    setSelectedSeatIds(current => {
      if (current.includes(seatId)) return current.filter(id => id !== seatId);
      if (current.length >= passengerCount) {
        setSelectionError(`Select up to ${passengerCount} seat${passengerCount === 1 ? '' : 's'} for this booking.`);
        return current;
      }
      return [...current, seatId];
    });
  };
  const handleSeatKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const availableSeats = [...document.querySelectorAll('.seat:not(:disabled)')];
    const index = availableSeats.indexOf(event.currentTarget);
    const nextIndex = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? index - 1 : index + 1;
    availableSeats[nextIndex]?.focus();
  };
  const totalSeatFees = selectedSeats.reduce((total, seat) => total + seat.price, 0);
  const totalPrice = flight.base_price * selectedSeats.length + totalSeatFees;
  const seatButton = (seat, column, row) => {
    const seatNumber = `${row}${column}`;
    const selected = selectedSeatIds.includes(seat?.seat_id);
    const details = rowDetails(row);
    const windowSeat = ['A', 'F'].includes(column);
    const seatType = windowSeat ? 'Window' : ['C', 'D'].includes(column) ? 'Aisle' : 'Middle';
    return <button key={column} className={`seat ${selected ? 'selected' : ''} ${!seat ? 'unavailable' : ''} seat-${details.tier.toLowerCase().replace(' ', '-')}`} type="button" aria-label={seat ? `Seat ${seatNumber}, ${seatType}, ${details.description}, ${selected ? 'Selected' : 'Available'}, ${details.price ? `extra INR ${details.price}` : 'base fare'}` : `Seat ${seatNumber}, unavailable`} aria-pressed={selected} title={seat ? `${seatNumber} · ${seatType} · ${details.description}${details.price ? ` · +${details.price} INR` : ''}` : `${seatNumber} unavailable`} disabled={!seat || (!selected && selectedSeats.length >= passengerCount)} onKeyDown={handleSeatKeyDown} onClick={() => seat && toggleSeat(seat.seat_id)}>{seatNumber}</button>;
  };

  return (
    <section className="card seat-picker">
      <div><p className="eyebrow">SEAT SELECTION</p><h1>Choose your seat</h1><p className="muted">{flight.flight_number} · {flight.origin_airport} to {flight.destination_airport}</p></div>
      {loading && <div className="status">Loading available seats...</div>}
      {error && <div className="status error" role="alert">{error}</div>}
      {!loading && !error && <><div className="seat-controls"><label>Travellers<select value={passengerCount} onChange={event => { const count = Number(event.target.value); setPassengerCount(count); setSelectedSeatIds(current => current.slice(0, count)); }}><option value="1">1 traveller</option><option value="2">2 travellers</option><option value="3">3 travellers</option><option value="4">4 travellers</option><option value="5">5 travellers</option></select></label><span className="seat-limit">Select {passengerCount} seat{passengerCount === 1 ? '' : 's'}</span></div><div className="seat-legend"><span><i className="seat-key available" />Available</span><span><i className="seat-key selected" />Selected</span><span><i className="seat-key unavailable" />Unavailable</span><span><i className="seat-key premium" />Premium +INR 750</span></div>{selectionError && <div className="status error" role="alert">{selectionError}</div>}<div className="aircraft-map" aria-label="Available aircraft seats"><div className="aircraft-front">Cockpit</div><div className="cabin-marker">Front cabin · Exit rows 10-11</div>{rowNumbers.map(row => <div className="seat-row" key={row}><span className="row-label">{row}</span>{columns.slice(0, 3).map(column => seatButton(seatByNumber.get(`${column}${row}`), column, row))}<span className="aisle" aria-hidden="true" />{columns.slice(3).map(column => seatButton(seatByNumber.get(`${column}${row}`), column, row))}</div>)}</div><div className="seat-summary" aria-live="polite"><div><strong>{selectedSeats.length ? `Selected: ${selectedSeats.map(seat => seat.seat_number).join(', ')}` : 'No seats selected'}</strong><span>{selectedSeats.length ? `Seat fees: ${formatRupees(totalSeatFees)} · Flight fare: ${formatRupees(flight.base_price * selectedSeats.length)}` : `Choose ${passengerCount} seat${passengerCount === 1 ? '' : 's'} to continue`}</span></div><strong>{formatRupees(totalPrice)}</strong></div><div className="form-actions"><button className="btn secondary-action" type="button" onClick={onBack}>Back to flights</button><button className="btn" type="button" disabled={selectedSeats.length !== passengerCount} onClick={() => onContinue(selectedSeats)}>Continue to payment</button></div></>}
    </section>
  );
}
