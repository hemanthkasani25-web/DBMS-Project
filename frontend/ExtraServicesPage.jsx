import { BriefcaseBusiness, Check, Coffee, Drum, Luggage, PlaneTakeoff, Utensils } from 'lucide-react';
import { useState } from 'react';

const formatRupees = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const baggageOptions = [
  { id: 'bag-5kg', label: 'Extra 5 kg', description: 'Add a little more room for your essentials.', price: 900, airportPrice: 1200 },
  { id: 'bag-10kg', label: 'Extra 10 kg', description: 'Best value for a longer trip.', price: 1600, airportPrice: 2200 }
];

const equipmentOptions = [
  { id: 'sporting-gear', label: 'Sporting equipment', description: 'Bikes, golf clubs, skis and other sporting gear.', price: 1800, airportPrice: 2400, icon: Drum },
  { id: 'instrument', label: 'Musical instrument', description: 'Protective handling for instruments and large cases.', price: 1500, airportPrice: 2000, icon: BriefcaseBusiness },
  { id: 'oversized-luggage', label: 'Extra-large luggage', description: 'For items exceeding standard checked-bag dimensions.', price: 2200, airportPrice: 3000, icon: Luggage }
];

const mealOptions = [
  { id: 'hot-meal', label: 'Hot meal', description: 'A freshly prepared main meal served onboard.', price: 650 },
  { id: 'snack-box', label: 'Snack box', description: 'A convenient selection for a lighter bite.', price: 300 }
];

const dietaryOptions = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Kosher'];
const beverageOptions = [
  { id: 'premium-drinks', label: 'Premium drinks', description: 'A selection of premium non-alcoholic and alcoholic drinks.', price: 850 },
  { id: 'coffee-pass', label: 'Coffee pass', description: 'Unlimited coffee, tea and hot chocolate on this flight.', price: 450 },
  { id: 'snack-combo', label: 'Snack combo', description: 'Pair your drink with a sweet and savoury snack.', price: 500 }
];

function ServiceCard({ option, selected, onToggle, icon: Icon = Check }) {
  return <button className={`service-card ${selected ? 'selected' : ''}`} type="button" onClick={onToggle} aria-pressed={selected}>
    <span className="service-icon"><Icon size={20} /></span>
    <span className="service-copy"><strong>{option.label}</strong><small>{option.description}</small>{option.airportPrice && <small className="service-save">Save {formatRupees(option.airportPrice - option.price)} online</small>}</span>
    <span className="service-price">{formatRupees(option.price)}</span>
    <span className="service-check" aria-hidden="true"><Check size={15} /></span>
  </button>;
}

export default function ExtraServicesPage({ flight, seats, onContinue, onBack }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [dietaryPreference, setDietaryPreference] = useState('');
  const toggle = id => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const allOptions = [...baggageOptions, ...equipmentOptions, ...mealOptions, ...beverageOptions];
  const selectedServices = allOptions.filter(option => selectedIds.includes(option.id));
  const total = selectedServices.reduce((sum, option) => sum + option.price, 0);
  const mealSelected = mealOptions.some(option => selectedIds.includes(option.id));

  return <section className="extra-services">
    <div className="extra-services-heading"><div><p className="eyebrow">STEP 3 OF 4 · OPTIONAL</p><h1>Add extra services</h1><p className="muted">Make your journey more comfortable before you pay. Online rates are lower than airport prices.</p></div><div className="extra-flight-badge"><PlaneTakeoff size={18} /><span>{flight.flight_number} · {seats.map(seat => seat.seat_number).join(', ')}</span></div></div>
    <div className="service-sections">
      <section className="service-section"><div className="service-section-heading"><Luggage size={21} /><div><h2>Extra baggage</h2><p>Pre-book allowance and skip airport pricing.</p></div></div><div className="service-grid">{baggageOptions.map(option => <ServiceCard key={option.id} option={option} icon={Luggage} selected={selectedIds.includes(option.id)} onToggle={() => toggle(option.id)} />)}</div></section>
      <section className="service-section"><div className="service-section-heading"><BriefcaseBusiness size={21} /><div><h2>Special equipment</h2><p>Traveling with something bigger than a suitcase?</p></div></div><div className="service-grid">{equipmentOptions.map(option => <ServiceCard key={option.id} option={option} selected={selectedIds.includes(option.id)} onToggle={() => toggle(option.id)} />)}</div></section>
      <section className="service-section"><div className="service-section-heading"><Utensils size={21} /><div><h2>Meals and refreshments</h2><p>Choose a meal, dietary preference or drink package.</p></div></div><div className="service-grid">{mealOptions.map(option => <ServiceCard key={option.id} option={option} icon={Utensils} selected={selectedIds.includes(option.id)} onToggle={() => toggle(option.id)} />)}</div>{mealSelected && <label className="dietary-select">Dietary preference<select value={dietaryPreference} onChange={event => setDietaryPreference(event.target.value)}><option value="">No specific preference</option>{dietaryOptions.map(option => <option key={option}>{option}</option>)}</select></label>}<div className="service-grid">{beverageOptions.map(option => <ServiceCard key={option.id} option={option} icon={Coffee} selected={selectedIds.includes(option.id)} onToggle={() => toggle(option.id)} />)}</div></section>
    </div>
    <div className="extra-services-footer"><div><strong>{selectedServices.length ? `${selectedServices.length} extra service${selectedServices.length === 1 ? '' : 's'} selected` : 'No extras selected'}</strong><span>{total ? `Add ${formatRupees(total)} to your booking` : 'You can continue without extras'}</span></div><div className="form-actions"><button className="btn secondary-action outline-action" type="button" onClick={onBack}>Back</button><button className="btn primary-action" type="button" onClick={() => onContinue([...selectedServices.map(service => ({ ...service, category: service.id.startsWith('bag-') ? 'baggage' : equipmentOptions.some(option => option.id === service.id) ? 'equipment' : beverageOptions.some(option => option.id === service.id) ? 'beverage' : 'meal' })), ...(dietaryPreference ? [{ id: 'dietary-preference', label: dietaryPreference, price: 0, category: 'dietary' }] : [])])}>Continue to payment {total ? `· ${formatRupees(total)}` : ''}</button></div></div>
  </section>;
}
