import { Check, ChevronDown, Clipboard, Download, Plane, Search, Ticket, X } from 'lucide-react';
import { useState } from 'react';
import axios from 'axios';

const api = 'http://localhost:5000';
const formatRupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const validDate = value => value && !Number.isNaN(new Date(value).getTime());
const datePart = value => validDate(value) ? new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Unavailable';
const timePart = value => validDate(value) ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Unavailable';

export default function BookingDetailsPage({ bookings, user, onBookingsChanged }) {
  const [busyBookingId, setBusyBookingId] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState('soonest');
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [copiedBookingId, setCopiedBookingId] = useState(null);
  const exportPdf = booking => window.location.assign(`${api}/api/bookings/${booking.booking_id}/receipt.pdf?user_id=${encodeURIComponent(user.user_id)}`);
  const copyReference = async booking => {
    try {
      await navigator.clipboard.writeText(booking.pnr_code);
      setCopiedBookingId(booking.booking_id);
      window.setTimeout(() => setCopiedBookingId(null), 1800);
    } catch {
      setError('Unable to copy the booking reference.');
    }
  };
  const cancelBooking = async booking => {
    if (!window.confirm(`Cancel booking ${booking.pnr_code}? Your seat will be released.`)) return;
    setBusyBookingId(booking.booking_id); setError('');
    try { await axios.post(`${api}/api/bookings/${booking.booking_id}/cancel`, { user_id: user.user_id }); await onBookingsChanged(); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Unable to cancel this booking.'); }
    finally { setBusyBookingId(null); }
  };
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBookings = bookings
    .filter(booking => statusFilter === 'ALL' || booking.booking_status === statusFilter)
    .filter(booking => !normalizedQuery || [booking.pnr_code, booking.flight_number, booking.origin_airport, booking.destination_airport, booking.passenger_name].some(value => value?.toLowerCase().includes(normalizedQuery)))
    .sort((first, second) => sortOrder === 'latest'
      ? new Date(second.departure_time) - new Date(first.departure_time)
      : new Date(first.departure_time) - new Date(second.departure_time));

  return <main className="container page-content">
    <section className="page-heading"><div><p className="eyebrow">YOUR TRAVEL</p><h1>Booking details</h1><p className="muted">Your confirmed trips are available below as e-tickets.</p></div><span className="booking-count">{bookings.length} booking{bookings.length === 1 ? '' : 's'}</span></section>
    {error && <div className="status error" role="alert">{error}</div>}
    {!bookings.length ? <section className="card empty-state"><Ticket size={36} /><h2>No bookings yet</h2><p>Your flight e-tickets will appear here after a booking is confirmed.</p><a className="btn" href="#available-flights">Find a flight</a></section> : <>
      <section className="booking-tools" aria-label="Filter bookings">
        <label className="booking-search"><Search size={18} /><span className="sr-only">Search bookings</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by PNR, flight, airport or passenger" /></label>
        <label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label><span className="sr-only">Sort bookings</span><select value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="soonest">Soonest first</option><option value="latest">Latest first</option></select></label>
      </section>
      {!visibleBookings.length ? <section className="card empty-state filtered-empty"><Search size={30} /><h2>No matching bookings</h2><p>Try a different search or clear the filters.</p><button className="btn" type="button" onClick={() => { setQuery(''); setStatusFilter('ALL'); }}>Clear filters</button></section> : <section className="ticket-list">{visibleBookings.map(booking => <article className={`e-ticket ${booking.booking_status === 'CANCELLED' ? 'cancelled-ticket' : ''}`} key={booking.booking_id}>
      <div className="ticket-main">
        <header className="ticket-header"><div className="ticket-brand"><Plane size={20} /><strong>SkyWings</strong><span>E-TICKET</span></div><span className={`ticket-status ${booking.booking_status.toLowerCase()}`}>{booking.booking_status}</span></header>
        <div className="ticket-route"><div><strong>{booking.origin_airport}</strong><span>Departure</span></div><div className="route-line"><Plane size={18} /><span>{booking.flight_number}</span></div><div><strong>{booking.destination_airport}</strong><span>Arrival</span></div></div>
        <div className="ticket-details"><div><span>Passenger</span><strong>{booking.passenger_name}</strong></div><div><span>Date</span><strong>{datePart(booking.departure_time)}</strong></div><div><span>Departure</span><strong>{timePart(booking.departure_time)}</strong></div><div><span>Seat</span><strong>{booking.seat_number || 'Not assigned'}</strong></div></div>
        {expandedBookingId === booking.booking_id && <div className="ticket-extra"><div><span>Booking reference</span><strong>{booking.pnr_code}</strong></div><div><span>Arrival</span><strong>{timePart(booking.arrival_time)}</strong></div><div><span>Booked on</span><strong>{booking.created_at ? datePart(booking.created_at) : 'Available in receipt'}</strong></div></div>}
        <button className="details-toggle" type="button" aria-expanded={expandedBookingId === booking.booking_id} onClick={() => setExpandedBookingId(expandedBookingId === booking.booking_id ? null : booking.booking_id)}><span>{expandedBookingId === booking.booking_id ? 'Hide details' : 'View details'}</span><ChevronDown size={17} /></button>
      </div>
      <aside className="ticket-stub"><span>BOOKING REFERENCE</span><strong className="pnr">{booking.pnr_code}</strong><button className="copy-reference" type="button" onClick={() => copyReference(booking)}><span>{copiedBookingId === booking.booking_id ? 'Copied' : 'Copy reference'}</span>{copiedBookingId === booking.booking_id ? <Check size={15} /> : <Clipboard size={15} />}</button><span>Flight</span><strong>{booking.flight_number}</strong><span>Paid</span><strong>{formatRupees(booking.total_amount)}</strong><div className="ticket-actions"><button className="icon-button" type="button" title="Download e-ticket PDF" onClick={() => exportPdf(booking)}><Download size={17} /> Download</button>{booking.booking_status === 'CONFIRMED' && <button className="icon-button cancel-button" type="button" disabled={busyBookingId === booking.booking_id} onClick={() => cancelBooking(booking)}><X size={17} />{busyBookingId === booking.booking_id ? 'Cancelling...' : 'Cancel'}</button>}</div></aside>
    </article>)}</section>}
    </>}
  </main>;
}
