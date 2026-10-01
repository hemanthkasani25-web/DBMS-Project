import { CheckCircle } from 'lucide-react';

export default function BookingConfirmation({ bookingData }) {
  if (!bookingData) return null;

  return (
    <div className="card" style={{ borderLeft: '4px solid #16a34a', backgroundColor: '#f0fdf4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#15803d' }}>
        <CheckCircle size={24} />
        <h3 style={{ margin: 0 }}>Booking Confirmed!</h3>
      </div>
      <p style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
        <strong>PNR Tracking Reference:</strong> <span style={{ color: '#2563eb' }}>{bookingData.pnr}</span>
      </p>
      <p style={{ margin: 0 }}>
        <strong>Transaction ID:</strong> {bookingData.transactionRef}
      </p>
    </div>
  );
}