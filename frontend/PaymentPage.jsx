import { ChevronDown, CreditCard, Landmark, LockKeyhole, Plane, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import axios from 'axios';
import { useState } from 'react';

const formatRupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function PaymentPage({ flight, seats, extras = [], user, onComplete, onBack }) {
  const [form, setForm] = useState({ passenger_name: user.full_name, passport_number: '', date_of_birth: '', gender: '', email: user.email || '', phone: '', payment_method: 'UPI', card_number: '', expiry: '', cvv: '', cardholder_name: user.full_name, upi_id: '', bank: '', wallet: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fareOpen, setFareOpen] = useState(true);
  const seatFees = seats.reduce((total, seat) => total + (seat.price || 0), 0);
  const baseFare = flight.base_price * seats.length;
  const taxes = Math.round(baseFare * 0.05);
  const extrasTotal = extras.reduce((total, extra) => total + (extra.price || 0), 0);
  const totalAmount = baseFare + taxes + seatFees + extrasTotal;
  const indianAirports = new Set(['DEL', 'CCU', 'HYD', 'BOM', 'MAA', 'BLR']);
  const isDomestic = indianAirports.has(flight.origin_airport) && indianAirports.has(flight.destination_airport);
  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const paymentNeedsCard = ['CREDIT_CARD', 'DEBIT_CARD'].includes(form.payment_method);
  const validCard = !paymentNeedsCard || (/^\d{16}$/.test(form.card_number.replaceAll(' ', '')) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(form.expiry) && /^\d{3,4}$/.test(form.cvv) && form.cardholder_name.trim().length > 2);
  const validPaymentDetails = form.payment_method === 'UPI' ? form.upi_id.includes('@') : form.payment_method === 'NET_BANKING' ? Boolean(form.bank) : form.payment_method === 'WALLET' ? Boolean(form.wallet) : validCard;
  const validForm = form.passenger_name.trim().split(/\s+/).length >= 2 && form.date_of_birth && form.gender && form.email.includes('@') && form.phone.trim().length >= 7 && (isDomestic || form.passport_number.trim().length >= 6) && validPaymentDetails && seats.length > 0;
  const missingFields = [
    form.passenger_name.trim().split(/\s+/).length < 2 && 'full first and last name',
    !form.date_of_birth && 'date of birth',
    !form.gender && 'gender',
    !form.email.includes('@') && 'valid email',
    form.phone.trim().length < 7 && 'phone number',
    !isDomestic && form.passport_number.trim().length < 6 && 'passport number',
    !validPaymentDetails && 'payment details'
  ].filter(Boolean);

  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await axios.post('http://localhost:5000/api/bookings', {
        user_id: user.user_id,
        flight_id: flight.flight_id,
        seat_ids: seats.map(seat => seat.seat_id),
        amount: totalAmount,
        passenger_name: form.passenger_name,
        passport_number: form.passport_number || form.government_id || 'DOMESTIC-ID-NOT-REQUIRED',
        payment_method: form.payment_method
      });
      onComplete(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Payment failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="payment-grid">
      <div>
        <p className="eyebrow">FINAL STEP</p>
        <h1>Complete your booking</h1>
        <p className="muted">Review your itinerary and passenger details before confirming.</p>
        <div className="flight-summary payment-flight-card"><div className="payment-route"><Plane size={20} /><strong>{flight.origin_airport}</strong><span>to</span><strong>{flight.destination_airport}</strong></div><strong>{flight.flight_number}</strong><span>{new Date(flight.departure_time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {new Date(flight.departure_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><span>Selected seats: {seats.map(seat => seat.seat_number).join(', ')}</span><button className="fare-toggle" type="button" onClick={() => setFareOpen(!fareOpen)} aria-expanded={fareOpen}>Fare breakdown <ChevronDown size={16} /></button>{fareOpen && <div className="fare-breakdown"><span>Base fare <strong>{formatRupees(baseFare)}</strong></span><span>Taxes and fees <strong>{formatRupees(taxes)}</strong></span><span>Seat fees <strong>{formatRupees(seatFees)}</strong></span>{extrasTotal > 0 && <span>Extra services <strong>{formatRupees(extrasTotal)}</strong></span>}</div>}<strong className="payment-total">Total {formatRupees(totalAmount)}</strong></div>
      </div>
      <form className="card payment-card" onSubmit={submit}>
        <div className="auth-heading"><CreditCard size={22} /><div><h2>Passenger and payment</h2><p>{isDomestic ? 'Domestic flight · Government ID is optional' : 'International flight · Passport required'}</p></div></div>
        <div className="payment-form-section"><h3>Passenger details</h3><div className="payment-form-grid"><label>Full name (First and Last)<input required value={form.passenger_name} onChange={event => updateForm('passenger_name', event.target.value)} placeholder="First Last" /></label><label>Date of birth<input required type="date" value={form.date_of_birth} onChange={event => updateForm('date_of_birth', event.target.value)} /></label><label>Gender<select required value={form.gender} onChange={event => updateForm('gender', event.target.value)}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></select></label><label>{isDomestic ? 'Government ID (optional)' : 'Passport number'}<input required={!isDomestic} minLength={isDomestic ? undefined : 6} value={form.passport_number} onChange={event => updateForm('passport_number', event.target.value)} /></label><label>Email for e-ticket<input required type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} /></label><label>Phone number<input required type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></label></div></div>
        <div className="payment-form-section"><h3>Payment method</h3><div className="payment-methods"><button className={form.payment_method === 'UPI' ? 'active' : ''} type="button" onClick={() => updateForm('payment_method', 'UPI')}><Smartphone size={18} />UPI</button><button className={form.payment_method === 'CREDIT_CARD' ? 'active' : ''} type="button" onClick={() => updateForm('payment_method', 'CREDIT_CARD')}><CreditCard size={18} />Credit card</button><button className={form.payment_method === 'DEBIT_CARD' ? 'active' : ''} type="button" onClick={() => updateForm('payment_method', 'DEBIT_CARD')}><CreditCard size={18} />Debit card</button><button className={form.payment_method === 'NET_BANKING' ? 'active' : ''} type="button" onClick={() => updateForm('payment_method', 'NET_BANKING')}><Landmark size={18} />Net banking</button><button className={form.payment_method === 'WALLET' ? 'active' : ''} type="button" onClick={() => updateForm('payment_method', 'WALLET')}><Wallet size={18} />Wallets</button></div>{form.payment_method === 'UPI' && <label>UPI ID<input required placeholder="name@bank" value={form.upi_id} onChange={event => updateForm('upi_id', event.target.value)} /></label>}{form.payment_method === 'NET_BANKING' && <label>Select bank<select required value={form.bank} onChange={event => updateForm('bank', event.target.value)}><option value="">Choose your bank</option><option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option><option>Axis Bank</option></select></label>}{form.payment_method === 'WALLET' && <label>Select wallet<select required value={form.wallet} onChange={event => updateForm('wallet', event.target.value)}><option value="">Choose wallet</option><option>GPay</option><option>PhonePe</option><option>Paytm</option></select></label>}{paymentNeedsCard && <div className="payment-form-grid card-fields"><label>Cardholder name<input required value={form.cardholder_name} onChange={event => updateForm('cardholder_name', event.target.value)} /></label><label>Card number<input required inputMode="numeric" maxLength="19" placeholder="1234 5678 9012 3456" value={form.card_number} onChange={event => updateForm('card_number', event.target.value)} /></label><label>Expiry date<input required placeholder="MM/YY" maxLength="5" value={form.expiry} onChange={event => updateForm('expiry', event.target.value)} /></label><label>CVV/CVC<input required type="password" inputMode="numeric" maxLength="4" value={form.cvv} onChange={event => updateForm('cvv', event.target.value)} /></label></div>}</div>
        {error && <div className="status error" role="alert">{error}</div>}
        <div className="security-note"><ShieldCheck size={18} /><span><strong>256-bit Encrypted Checkout</strong><small><LockKeyhole size={13} /> Secure payment · Visa · Mastercard · RuPay</small></span></div>
        {!validForm && <p className="payment-requirements" role="status">Complete: {missingFields.join(', ')}.</p>}
        <div className="form-actions"><button className="btn secondary-action outline-action" type="button" onClick={onBack}>Back</button><button className="btn payment-action" disabled={submitting || !validForm} title={!validForm ? `Complete ${missingFields.join(', ')}` : ''}>{submitting ? 'Processing...' : `Pay ${formatRupees(totalAmount)}`}</button></div>
      </form>
    </section>
  );
}