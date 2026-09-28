// Single source of truth for business facts.
// Empty strings render as visible "fill me in" placeholders on the site,
// so nothing unconfirmed ever ships looking real. Fill these in before launch.

export const business = {
  name: '', // e.g. "Rivera Family Roofing"
  shortName: '', // used in tight spots like the header on phones
  phone: '', // display format, e.g. "(562) 555-0134"
  email: '',
  address: '', // street, city, ZIP
  license: '', // California CSLB license number, required on contractor ads
  foundedYear: '', // e.g. "1987"
  hours: '', // e.g. "Mon–Sat, 7am–6pm"
  emergencyHours: '', // e.g. "24/7 for active leaks"
  // Link to your online booking tool (Calendly, Jobber, Housecall Pro...).
  // Leave empty to send "Book online" to the booking section of the contact page.
  bookingUrl: '',
  // Where the estimate form posts (Formspree, Netlify Forms, your CRM...).
  // Leave empty and the form shows a friendly "not connected yet" message.
  formAction: '',
  googleReviewsUrl: '',
};

export const brandFallbackName = 'Your Roofing Company';
export const displayName = business.name || brandFallbackName;

export const telHref = business.phone ? `tel:${business.phone.replace(/[^\d+]/g, '')}` : '#call';
export const bookHref = business.bookingUrl || '/contact/#book';

export const nav = [
  { href: '/services/', label: 'Services' },
  { href: '/financing/', label: 'Financing' },
  { href: '/service-areas/', label: 'Service areas' },
  { href: '/about/', label: 'About us' },
  { href: '/contact/', label: 'Contact' },
];

export type Service = {
  slug: string;
  icon: string;
  title: string;
  lede: string;
  points: string[];
  photoLabel: string;
};

export const services: Service[] = [
  {
    slug: 'repair',
    icon: 'hammer',
    title: 'Roof repair',
    lede: 'Leaks, cracked or missing shingles, slipped tiles, worn flashing and vents. We find the cause, not just the wet spot, and fix it to the manufacturer’s spec.',
    points: ['Leak tracing and repair', 'Shingle and tile replacement', 'Flashing, vents and skylight seals'],
    photoLabel: 'Repair in progress',
  },
  {
    slug: 'replacement',
    icon: 'house',
    title: 'Roof replacement',
    lede: 'A full tear-off and new roof installed by a manufacturer-certified crew, backed by manufacturer and workmanship warranties, with financing if you want to spread the cost.',
    points: ['Full tear-off and deck inspection', 'Certified installation', 'Manufacturer and workmanship warranties'],
    photoLabel: 'Finished replacement',
  },
  {
    slug: 'emergency',
    icon: 'cloud-rain',
    title: 'Emergency leak and storm response',
    lede: 'Water coming in? Call. We move fast to stop active leaks, tarp and protect the house, and document the damage for your insurance claim.',
    points: ['Fast response for active leaks', 'Tarping and temporary protection', 'Photo documentation for insurance'],
    photoLabel: 'Emergency tarp',
  },
  {
    slug: 'inspection',
    icon: 'search',
    title: 'Inspections and free estimates',
    lede: 'Buying, selling, or just unsure? We get on the roof, photograph what we find, and give you a clear written estimate with no pressure and no cost.',
    points: ['On-roof inspection with photos', 'Written, itemized estimate', 'Repair vs. replace advice'],
    photoLabel: 'Inspection photo',
  },
];

// TODO: confirm the cities you actually serve; this list is geography, not a claim.
export const areas = {
  'Los Angeles County': [
    'Long Beach', 'Torrance', 'Pasadena', 'Glendale', 'Burbank', 'Santa Clarita',
    'Whittier', 'Downey', 'Lakewood', 'Cerritos', 'West Covina', 'Pomona',
    'Redondo Beach', 'Santa Monica', 'Palmdale', 'Lancaster',
  ],
  'Orange County': [
    'Anaheim', 'Santa Ana', 'Irvine', 'Huntington Beach', 'Garden Grove', 'Orange',
    'Fullerton', 'Costa Mesa', 'Tustin', 'Yorba Linda', 'Mission Viejo', 'Lake Forest',
    'Newport Beach', 'Laguna Niguel', 'Buena Park', 'San Clemente',
  ],
};

// Real reviews only. Paste them here with the customer's permission.
export type Review = { quote: string; name: string; city: string; source: string };
export const reviews: Review[] = [];

// Manufacturer certifications you actually hold, e.g. "GAF Certified Contractor".
export const certifications: string[] = [];

export const steps = [
  { title: 'Free inspection', text: 'We come out, get on the roof, and photograph everything we see.' },
  { title: 'Clear written estimate', text: 'Itemized pricing, repair-or-replace advice, and financing options if you want them.' },
  { title: 'Certified install', text: 'Our own crew does the work, keeps the site clean, and walks it with you at the end.' },
  { title: 'Warranty in writing', text: 'You get the manufacturer and workmanship warranty paperwork for your records.' },
];
