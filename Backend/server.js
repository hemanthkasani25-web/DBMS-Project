const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PAYMENT_METHODS = [
  { code: 'CREDIT_CARD', label: 'Credit card' },
  { code: 'DEBIT_CARD', label: 'Debit card' },
  { code: 'UPI', label: 'UPI' },
  { code: 'NET_BANKING', label: 'Net banking' },
  { code: 'WALLET', label: 'Wallets' }
];

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS connected', (err) => {
    if (err) return res.status(503).json({ status: 'error', error: err.message });
    res.json({ status: 'ok', database: 'connected' });
  });
});

// MySQL Database Connection Pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});
const dbPromise = db.promise();
const SCHEDULE_TEMPLATE_DATE = process.env.SCHEDULE_TEMPLATE_DATE || '2026-09-12';

const isValidTravelDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const ensureMinimumTemplateFlights = async () => {
  const [routes] = await dbPromise.query(`
    SELECT origin_airport, destination_airport, COUNT(*) AS flight_count
    FROM flight_schedules
    WHERE DATE(departure_time) = ?
    GROUP BY origin_airport, destination_airport
  `, [SCHEDULE_TEMPLATE_DATE]);

  for (const route of routes) {
    const missingFlights = 20 - Number(route.flight_count);
    if (missingFlights <= 0) continue;

    const [templateRows] = await dbPromise.query(`
      SELECT departure_time, arrival_time, base_price, aircraft_id
      FROM flight_schedules
      WHERE DATE(departure_time) = ? AND origin_airport = ? AND destination_airport = ?
      ORDER BY departure_time ASC LIMIT 1
    `, [SCHEDULE_TEMPLATE_DATE, route.origin_airport, route.destination_airport]);
    if (!templateRows.length) continue;

    const template = templateRows[0];
    for (let index = Number(route.flight_count) + 1; index <= 20; index += 1) {
      const flightNumber = `${route.origin_airport}-${route.destination_airport}-${String(index).padStart(2, '0')}`;
      const departure = new Date(template.departure_time);
      departure.setHours(5 + (index % 15), 0, 0, 0);
      const arrival = new Date(departure.getTime() + (new Date(template.arrival_time) - new Date(template.departure_time)));
      const [inserted] = await dbPromise.query(`
        INSERT IGNORE INTO flight_schedules
          (flight_number, aircraft_id, origin_airport, destination_airport, departure_time, arrival_time, base_price, available_seats, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 300, 'SCHEDULED')
      `, [flightNumber, template.aircraft_id, route.origin_airport, route.destination_airport, departure, arrival, Number(template.base_price) + (index * 25)]);

      if (inserted.insertId) {
        const seats = Array.from({ length: 300 }, (_, seatIndex) => [inserted.insertId, `${String.fromCharCode(65 + (seatIndex % 6))}${Math.floor(seatIndex / 6) + 1}`, 'ECONOMY', false]);
        await dbPromise.query('INSERT INTO flight_seats (flight_id, seat_number, seat_class, is_booked) VALUES ?', [seats]);
      }
    }
  }
};

// Flight schedules are materialized only for dates passengers search for. This keeps
// the database small while allowing the existing date picker to search any valid day.
const ensureSchedulesForDate = async travelDate => {
  if (!travelDate || travelDate === SCHEDULE_TEMPLATE_DATE) return;
  if (!isValidTravelDate(travelDate)) throw new Error('Please provide a valid travel date (YYYY-MM-DD).');

  const [existing] = await dbPromise.query('SELECT flight_id FROM flight_schedules WHERE DATE(departure_time) = ? LIMIT 1', [travelDate]);

  const dateSuffix = travelDate.replaceAll('-', '');
  if (!existing.length) {
    await dbPromise.query(`
      INSERT IGNORE INTO flight_schedules
        (flight_number, aircraft_id, origin_airport, destination_airport, departure_time, arrival_time, base_price, available_seats, status)
      SELECT CONCAT(flight_number, '-', ?), aircraft_id, origin_airport, destination_airport,
             TIMESTAMP(?, TIME(departure_time)),
             DATE_ADD(TIMESTAMP(?, TIME(departure_time)), INTERVAL TIMESTAMPDIFF(MINUTE, departure_time, arrival_time) MINUTE),
             base_price, available_seats, status
      FROM flight_schedules
      WHERE DATE(departure_time) = ?
    `, [dateSuffix, travelDate, travelDate, SCHEDULE_TEMPLATE_DATE]);
  }

  await dbPromise.query(`
    INSERT IGNORE INTO flight_seats (flight_id, seat_number, seat_class, is_booked)
    SELECT generatedFlight.flight_id, templateSeat.seat_number, templateSeat.seat_class, FALSE
    FROM flight_schedules templateFlight
    JOIN flight_seats templateSeat ON templateSeat.flight_id = templateFlight.flight_id
    JOIN flight_schedules generatedFlight ON generatedFlight.flight_number = CONCAT(templateFlight.flight_number, '-', ?)
    WHERE DATE(templateFlight.departure_time) = ?
      AND NOT EXISTS (SELECT 1 FROM flight_seats existingSeat WHERE existingSeat.flight_id = generatedFlight.flight_id)
  `, [dateSuffix, SCHEDULE_TEMPLATE_DATE]);
};

const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, hash] = storedHash.split(':');
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derivedHash, 'hex'));
};

app.post('/api/auth/register', (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Name, email, and a password of at least 6 characters are required.' });
  }

  db.query('SELECT user_id FROM users WHERE email = ?', [email.trim().toLowerCase()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, "PASSENGER")',
      [full_name.trim(), email.trim().toLowerCase(), hashPassword(password)],
      (insertError, result) => {
        if (insertError) return res.status(500).json({ error: insertError.message });
        res.status(201).json({ user: { user_id: result.insertId, full_name: full_name.trim(), email: email.trim().toLowerCase() } });
      }
    );
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT user_id, full_name, email, password_hash FROM users WHERE email = ?', [email?.trim().toLowerCase()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length || !verifyPassword(password || '', rows[0].password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const { user_id, full_name, email: userEmail } = rows[0];
    res.json({ user: { user_id, full_name, email: userEmail } });
  });
});

// GET: Fetch available flight schedules matching the search form.
app.get('/api/locations', (req, res) => {
  const sql = `
    SELECT airport_code FROM (
      SELECT origin_airport AS airport_code FROM flight_schedules
      UNION
      SELECT destination_airport AS airport_code FROM flight_schedules
    ) route_locations
    ORDER BY airport_code
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const names = { DEL: 'Delhi', CCU: 'Kolkata', HYD: 'Hyderabad', BOM: 'Mumbai', MAA: 'Chennai', BLR: 'Bengaluru', JFK: 'New York', LHR: 'London' };
    res.json(results.map(location => ({
      code: location.airport_code,
      name: names[location.airport_code] || location.airport_code
    })));
  });
});

app.get('/api/routes', (req, res) => {
  const sql = `SELECT DISTINCT origin_airport, destination_airport FROM flight_schedules ORDER BY origin_airport, destination_airport`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// The frontend may use this endpoint to populate payment choices without hard-coding them.
app.get('/api/payment-methods', (req, res) => {
  res.json(PAYMENT_METHODS);
});

app.get('/api/flights', async (req, res) => {
  const { from, to, date, departure_after, departure_before } = req.query;
  const travelDate = date || '';
  try {
    await ensureMinimumTemplateFlights();
    await ensureSchedulesForDate(travelDate);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const sql = `
    WITH ranked_flights AS (
      SELECT f.flight_id, f.flight_number,
        CASE MOD(f.flight_id, 4)
          WHEN 0 THEN 'Air India'
          WHEN 1 THEN 'IndiGo'
          WHEN 2 THEN 'Air India Express'
          ELSE 'Akasa Air'
        END AS company_name,
        f.origin_airport, f.destination_airport,
        f.departure_time, f.arrival_time, f.base_price, f.available_seats, a.model,
        ROW_NUMBER() OVER (
          PARTITION BY f.origin_airport, f.destination_airport
          ORDER BY f.departure_time ASC
        ) AS destination_rank
      FROM flight_schedules f
      JOIN aircraft a ON f.aircraft_id = a.aircraft_id
      WHERE f.available_seats > 0
        AND (? = '' OR f.origin_airport = ?)
        AND (? = '' OR f.destination_airport = ?)
        AND (? = '' OR DATE(f.departure_time) = ?)
        AND (? = '' OR TIME(f.departure_time) >= ?)
        AND (? = '' OR TIME(f.departure_time) <= ?)
    )
    SELECT flight_id, flight_number, company_name, origin_airport, destination_airport,
      departure_time, arrival_time, base_price, available_seats, model
    FROM ranked_flights
    WHERE destination_rank <= 20
    ORDER BY departure_time ASC
  `;
  const origin = (from || '').trim().toUpperCase();
  const destination = (to || '').trim().toUpperCase();
  const departureAfter = departure_after || '';
  const departureBefore = departure_before || '';
  db.query(sql, [origin, origin, destination, destination, travelDate, travelDate, departureAfter, departureAfter, departureBefore, departureBefore], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/flights/:flightId/seats', (req, res) => {
  const sql = `
    SELECT seat_id, seat_number, seat_class
    FROM flight_seats
    WHERE flight_id = ? AND is_booked = FALSE
    ORDER BY seat_id
  `;
  db.query(sql, [req.params.flightId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/bookings/user/:userId', (req, res) => {
  const sql = `
    SELECT b.booking_id, b.pnr_code, b.total_amount, b.booking_status, b.created_at,
           f.flight_number, f.origin_airport, f.destination_airport, f.departure_time, f.arrival_time,
           bs.passenger_name, bs.passport_number, fs.seat_number, p.payment_method, p.payment_status, p.transaction_ref
    FROM bookings b
    JOIN booking_segments bs ON b.booking_id = bs.booking_id
    JOIN flight_schedules f ON bs.flight_id = f.flight_id
    LEFT JOIN flight_seats fs ON bs.seat_id = fs.seat_id
    LEFT JOIN payments p ON b.booking_id = p.booking_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `;
  db.query(sql, [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Downloadable, server-rendered receipt.  No client-side changes are required to use it.
app.get('/api/bookings/:bookingId/receipt', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

  const sql = `
    SELECT b.booking_id, b.pnr_code, b.total_amount, b.booking_status, b.created_at,
           f.flight_number, f.origin_airport, f.destination_airport, f.departure_time, f.arrival_time,
           bs.passenger_name, bs.passport_number, fs.seat_number, p.payment_method, p.payment_status, p.transaction_ref
    FROM bookings b
    JOIN booking_segments bs ON b.booking_id = bs.booking_id
    JOIN flight_schedules f ON bs.flight_id = f.flight_id
    LEFT JOIN flight_seats fs ON bs.seat_id = fs.seat_id
    LEFT JOIN payments p ON b.booking_id = p.booking_id
    WHERE b.booking_id = ? AND b.user_id = ?
    LIMIT 1
  `;
  db.query(sql, [req.params.bookingId, user_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });

    const booking = rows[0];
    const receipt = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(booking.pnr_code)}</title>
      <style>body{font-family:Arial,sans-serif;margin:40px;color:#172033}h1{color:#0f4c81}table{border-collapse:collapse;width:100%;max-width:680px}td{padding:10px;border-bottom:1px solid #dbe3ee}td:first-child{font-weight:700;width:42%}</style></head><body>
      <h1>SkyWings booking receipt</h1><table>
      <tr><td>PNR</td><td>${escapeHtml(booking.pnr_code)}</td></tr><tr><td>Status</td><td>${escapeHtml(booking.booking_status)}</td></tr>
      <tr><td>Passenger</td><td>${escapeHtml(booking.passenger_name)}</td></tr><tr><td>Flight</td><td>${escapeHtml(booking.flight_number)} — ${escapeHtml(booking.origin_airport)} to ${escapeHtml(booking.destination_airport)}</td></tr>
      <tr><td>Departure</td><td>${escapeHtml(new Date(booking.departure_time).toLocaleString())}</td></tr><tr><td>Seat</td><td>${escapeHtml(booking.seat_number || 'Not assigned')}</td></tr>
      <tr><td>Payment</td><td>${escapeHtml(booking.payment_method || 'Not recorded')} (${escapeHtml(booking.payment_status || 'Not recorded')})</td></tr><tr><td>Transaction ID</td><td>${escapeHtml(booking.transaction_ref || 'Not available')}</td></tr>
      <tr><td>Total</td><td>&#8377;${escapeHtml(booking.total_amount)}</td></tr></table></body></html>`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="receipt-${booking.pnr_code}.html"` });
    res.send(receipt);
  });
});

const createReceiptPdf = booking => {
  const pdfText = value => String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
  const lines = [
    ['SkyWings Booking Receipt', 20],
    [`PNR: ${booking.pnr_code}`, 12],
    [`Status: ${booking.booking_status}`, 12],
    [`Booking date: ${new Date(booking.created_at).toLocaleString()}`, 12],
    [`Passenger: ${booking.passenger_name}`, 12],
    [`Flight / destination: ${booking.flight_number} - ${booking.origin_airport} to ${booking.destination_airport}`, 12],
    [`Flight date and time: ${new Date(booking.departure_time).toLocaleString()}`, 12],
    [`Seat${booking.seat_numbers?.length === 1 ? '' : 's'}: ${booking.seat_numbers?.join(', ') || booking.seat_number || 'Not assigned'}`, 12],
    [`Payment: ${booking.payment_method || 'Not recorded'} (${booking.payment_status || 'Not recorded'})`, 12],
    [`Transaction ID: ${booking.transaction_ref || 'Not available'}`, 12],
    [`Total: INR ${booking.total_amount}`, 14]
  ];
  const stream = ['BT'];
  let y = 760;
  lines.forEach(([line, size], index) => {
    // Tm positions each line absolutely. Td is relative and pushed later lines off-page.
    stream.push(`/F1 ${size} Tf`, `1 0 0 1 72 ${y} Tm`, `(${pdfText(line)}) Tj`);
    y -= index === 0 ? 38 : 25;
  });
  stream.push('ET');
  const content = stream.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
};

app.get('/api/bookings/:bookingId/receipt.pdf', (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
  const sql = `
    SELECT b.pnr_code, b.total_amount, b.booking_status, b.created_at, f.flight_number, f.origin_airport, f.destination_airport, f.departure_time,
           bs.passenger_name, fs.seat_number, p.payment_method, p.payment_status, p.transaction_ref
    FROM bookings b JOIN booking_segments bs ON b.booking_id = bs.booking_id JOIN flight_schedules f ON bs.flight_id = f.flight_id
    LEFT JOIN flight_seats fs ON bs.seat_id = fs.seat_id LEFT JOIN payments p ON b.booking_id = p.booking_id
    WHERE b.booking_id = ? AND b.user_id = ?
  `;
  db.query(sql, [req.params.bookingId, user_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });
    const booking = { ...rows[0], seat_numbers: rows.map(row => row.seat_number).filter(Boolean) };
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="receipt-${booking.pnr_code}.pdf"` });
    res.send(createReceiptPdf(booking));
  });
});

// Cancel a confirmed booking, release its seat, and return the refundable amount.
app.post('/api/bookings/:bookingId/cancel', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

  db.getConnection((connectionError, connection) => {
    if (connectionError) return res.status(500).json({ error: connectionError.message });
    connection.beginTransaction(transactionError => {
      if (transactionError) { connection.release(); return res.status(500).json({ error: transactionError.message }); }
      const fail = (status, error) => connection.rollback(() => { connection.release(); res.status(status).json({ error }); });
      connection.query('SELECT booking_id, total_amount, booking_status FROM bookings WHERE booking_id = ? AND user_id = ? FOR UPDATE', [req.params.bookingId, user_id], (error, bookings) => {
        if (error) return fail(500, error.message);
        if (!bookings.length) return fail(404, 'Booking not found.');
        if (bookings[0].booking_status !== 'CONFIRMED') return fail(409, 'Only confirmed bookings can be cancelled.');
        connection.query('SELECT flight_id, seat_id FROM booking_segments WHERE booking_id = ?', [req.params.bookingId], (segmentError, segments) => {
          if (segmentError) return fail(500, segmentError.message);
          if (!segments.length) return fail(409, 'Booking has no flight segment.');
          connection.query('UPDATE bookings SET booking_status = "CANCELLED" WHERE booking_id = ?', [req.params.bookingId], updateError => {
            if (updateError) return fail(500, updateError.message);
            const seatIds = segments.map(segment => segment.seat_id);
            connection.query('UPDATE flight_seats SET is_booked = FALSE WHERE seat_id IN (?)', [seatIds], seatError => {
              if (seatError) return fail(500, seatError.message);
              connection.query('UPDATE flight_schedules SET available_seats = available_seats + ? WHERE flight_id = ?', [segments.length, segments[0].flight_id], inventoryError => {
                if (inventoryError) return fail(500, inventoryError.message);
                connection.query('UPDATE payments SET payment_status = "REFUNDED" WHERE booking_id = ?', [req.params.bookingId], paymentError => {
                  if (paymentError) return fail(500, paymentError.message);
                  connection.commit(commitError => {
                    if (commitError) return fail(500, commitError.message);
                    connection.release();
                    res.json({ message: 'Booking cancelled and seats released.', booking_id: Number(req.params.bookingId), refund_amount: bookings[0].total_amount });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// POST: Create Flight Booking & Process Payment (Transaction)
app.post('/api/bookings', (req, res) => {
  const { user_id, flight_id, seat_id, seat_ids, amount, payment_method, passenger_name, passport_number } = req.body;
  const requestedSeatIds = [...new Set(Array.isArray(seat_ids) && seat_ids.length ? seat_ids : (seat_id ? [seat_id] : []))];
  if (!user_id || !flight_id || !passenger_name || !PAYMENT_METHODS.some(method => method.code === payment_method)) {
    return res.status(400).json({ error: 'A user, flight, passenger details, and a supported payment method are required.' });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'A valid payment amount is required.' });
  // pnr_code is VARCHAR(10) in the existing database: "PNR-" + six characters.
  const pnr = 'PNR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const txRef = 'TXN-' + Date.now();

  db.getConnection((err, connection) => {
    if (err) return res.status(500).json({ error: err.message });

    connection.beginTransaction(err => {
      if (err) { connection.release(); return res.status(500).json({ error: err.message }); }

      const seatSql = requestedSeatIds.length
        ? 'SELECT seat_id, seat_number FROM flight_seats WHERE flight_id = ? AND seat_id IN (?) AND is_booked = FALSE FOR UPDATE'
        : 'SELECT seat_id, seat_number FROM flight_seats WHERE flight_id = ? AND is_booked = FALSE LIMIT 1 FOR UPDATE';
      connection.query(seatSql, requestedSeatIds.length ? [flight_id, requestedSeatIds] : [flight_id], (seatError, seatResult) => {
        if (seatError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: seatError.message }); });
        if (!seatResult.length || (requestedSeatIds.length && seatResult.length !== requestedSeatIds.length)) {
          return connection.rollback(() => { connection.release(); res.status(409).json({ error: 'One or more selected seats are no longer available. Please choose again.' }); });
        }
        const confirmedSeatIds = seatResult.map(seat => seat.seat_id);
        const bookingSql = 'INSERT INTO bookings (pnr_code, user_id, total_amount, booking_status) VALUES (?, ?, ?, "CONFIRMED")';
        connection.query(bookingSql, [pnr, user_id, amount], (bookingError, bookingResult) => {
          if (bookingError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: bookingError.message }); });
          const bookingId = bookingResult.insertId;
          const segments = seatResult.map(seat => [bookingId, flight_id, seat.seat_id, passenger_name, passport_number]);
          connection.query('INSERT INTO booking_segments (booking_id, flight_id, seat_id, passenger_name, passport_number) VALUES ?', [segments], segmentError => {
            if (segmentError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: segmentError.message }); });
            connection.query('INSERT INTO payments (booking_id, amount, payment_method, payment_status, transaction_ref) VALUES (?, ?, ?, "SUCCESS", ?)', [bookingId, amount, payment_method, txRef], paymentError => {
              if (paymentError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: paymentError.message }); });
              connection.query('UPDATE flight_seats SET is_booked = TRUE WHERE seat_id IN (?) AND is_booked = FALSE', [confirmedSeatIds], (updateError, seatUpdate) => {
                if (updateError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: updateError.message }); });
                if (seatUpdate.affectedRows !== confirmedSeatIds.length) return connection.rollback(() => { connection.release(); res.status(409).json({ error: 'One or more selected seats were just booked. Please choose again.' }); });
                connection.query('UPDATE flight_schedules SET available_seats = available_seats - ? WHERE flight_id = ? AND available_seats >= ?', [confirmedSeatIds.length, flight_id, confirmedSeatIds.length], (scheduleError, scheduleUpdate) => {
                  if (scheduleError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: scheduleError.message }); });
                  if (scheduleUpdate.affectedRows !== 1) return connection.rollback(() => { connection.release(); res.status(409).json({ error: 'Not enough seats available for this flight.' }); });
                  connection.commit(commitError => {
                    if (commitError) return connection.rollback(() => { connection.release(); res.status(500).json({ error: commitError.message }); });
                    connection.release();
                    res.status(201).json({ message: 'Booking confirmed!', booking_id: bookingId, pnr, total_amount: Number(amount), transactionRef: txRef, seatNumbers: seatResult.map(seat => seat.seat_number), seatCount: confirmedSeatIds.length });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
