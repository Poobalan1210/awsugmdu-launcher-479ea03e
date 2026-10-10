/**
 * Checkout details for physical store items: how the order reaches the
 * member, and how to reach them.
 *
 * Shared by store-crud (spending points) and campaign-crud (claiming a Kiro
 * University prize), so both ask for and accept exactly the same details.
 * This is the master copy. deploy.sh mirrors it into each Lambda's shared/
 * folder, so edit it here. normalisePhone must also match src/lib/store.ts.
 */
const FULFILLMENT_METHODS = ['ship', 'pickup'];

/** Trimmed single-line text of at most `max` characters, or ''. */
function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * A mobile number as digits with an optional leading +, or '' when it does not
 * look like one. Spaces, dashes, dots and brackets are dropped.
 */
function normalisePhone(value) {
  const compact = cleanText(value, 30).replace(/[\s().-]/g, '');
  return /^\+?\d{10,15}$/.test(compact) ? compact : '';
}

/**
 * What a physical order needs: how it reaches the member, and how to reach
 * them. A mobile number is required either way, for the courier or to find
 * them at the event. Virtual items need nothing; their code goes by email.
 *
 * Returns { method, contact, notes } or { error }.
 */
function validateCheckout(itemType, data) {
  if (itemType !== 'physical') return {};
  const body = data && typeof data === 'object' ? data : {};
  const method = body.fulfillmentMethod;
  if (!FULFILLMENT_METHODS.includes(method)) {
    return { error: 'Choose whether to have it shipped or to collect it at our next in-person event.' };
  }
  const given = body.shippingAddress && typeof body.shippingAddress === 'object' ? body.shippingAddress : {};
  const name = cleanText(given.name, 100);
  const phone = normalisePhone(given.phone);
  if (!name) return { error: 'Enter your full name.' };
  if (!phone) return { error: 'Enter a valid mobile number, so we can reach you about your order.' };
  const notes = cleanText(body.notes, 300);
  if (method === 'pickup') return { method, contact: { name, phone }, notes };

  const address = cleanText(given.address, 300);
  const city = cleanText(given.city, 80);
  const state = cleanText(given.state, 80);
  const zipCode = cleanText(given.zipCode, 12).replace(/\s/g, '');
  if (!address || !city || !state) return { error: 'Enter your full shipping address: street, city and state.' };
  if (!/^\d{6}$/.test(zipCode)) return { error: 'Enter your 6-digit PIN code.' };
  return { method, contact: { name, address, city, state, zipCode, phone }, notes };
}

module.exports = { FULFILLMENT_METHODS, cleanText, normalisePhone, validateCheckout };
