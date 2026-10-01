import { useState } from 'react';
import axios from 'axios';

const api = 'http://localhost:5000';
const formatRupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function BookingList({ bookings, user, onBookingsChanged }) {
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [error, setError] = useState('');

  const cancelBooking = async booking => {
    if (!window.confirm(`Cancel booking ${booking.pnr_code}? Your seat will be released.`)) return;
    setBusyBookingId(booking.booking_id);
    setError('');
    try {
      await axios.post(`${api}/api/bookings/${booking.booking_id}/cancel`, { user_id: user.user_id });
      await onBookingsChanged();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to cancel this booking.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const exportPdf = booking => {
    window.location.assign(`${api}/api/bookings/${booking.booking_id}/receipt.pdf?user_id=${encodeURIComponent(user.user_id)}`);
  };

  return (
    <section className="card" id="bookings">
      <div className="section-heading"><div><p className="eyebrow">YOUR TRAVEL</p><h2>Booking details</h2></div><span className="booking-count">{bookings.length} booking{bookings.length === 1 ? '' : 's'}</span></div>
      {error && <div className="status error" role="alert">{error}</div>}
      {!bookings.length ? <p className="muted">Your confirmed bookings will appear here.</p> : <div className="booking-list">{bookings.map(booking => <article className="booking-item" key={booking.booking_id}><div><strong>{booking.pnr_code}</strong><span>{booking.passenger_name}</span><span>{booking.seat_number ? `Seat ${booking.seat_number}` : 'Seat not assigned'}</span><span>{booking.booking_status}</span></div><div><strong>{booking.flight_number}</strong><span>{booking.origin_airport} to {booking.destination_airport}</span><span>{new Date(booking.departure_time).toLocaleString()}</span></div><strong>{formatRupees(booking.total_amount)}</strong><div className="booking-actions"><button className="btn secondary-action" type="button" onClick={() => exportPdf(booking)}>Export PDF</button>{booking.booking_status === 'CONFIRMED' && <button className="btn danger-action" type="button" disabled={busyBookingId === booking.booking_id} onClick={() => cancelBooking(booking)}>{busyBookingId === booking.booking_id ? 'Cancelling...' : 'Cancel flight'}</button>}</div></article>)}</div>}
    </section>
  );
}
