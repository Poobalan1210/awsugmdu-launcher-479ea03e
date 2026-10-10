import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CalendarClock, Loader2, MapPin, Ticket, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  isValidPinCode, normalisePhone, SHIPPING_WINDOW,
  type FulfillmentMethod, type ItemType, type RedeemRequest,
} from '@/lib/store';

const EMPTY_CONTACT = { name: '', phone: '', address: '', city: '', state: '', zipCode: '' };
type Contact = typeof EMPTY_CONTACT;
type CheckoutErrors = Partial<Record<keyof Contact | 'fulfillment', string>>;

// Kept between checkouts in this tab, so a second order needs no retyping.
// Per member, so someone signing in after them on the same tab never sees
// their address.
const rememberedContacts = new Map<string, Contact>();

/** The same checks the backend makes, so mistakes show before the request. */
function checkoutErrors(method: FulfillmentMethod | null, contact: Contact): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (!method) errors.fulfillment = 'Choose shipping or collection at the event.';
  if (!contact.name.trim()) errors.name = 'Enter your full name.';
  if (!normalisePhone(contact.phone)) errors.phone = 'Enter a valid mobile number, for example 98765 43210.';
  if (method === 'ship') {
    if (!contact.address.trim()) errors.address = 'Enter your street address.';
    if (!contact.city.trim()) errors.city = 'Enter your city.';
    if (!contact.state.trim()) errors.state = 'Enter your state.';
    if (!isValidPinCode(contact.zipCode)) errors.zipCode = 'Enter your 6-digit PIN code.';
  }
  return errors;
}

const FULFILLMENT_OPTIONS: { value: FulfillmentMethod; title: string; hint: string; icon: typeof Truck }[] = [
  { value: 'ship', title: 'Ship it to me', hint: `Delivered to your address. Ships in ${SHIPPING_WINDOW}.`, icon: Truck },
  { value: 'pickup', title: 'Collect it at our next in-person event', hint: 'Pick it up from the organisers.', icon: MapPin },
];

export interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being checked out. */
  item: { name: string; points: number; itemType: ItemType } | null;
  /**
   * Set when a prize coupon pays for the item: no points are taken, and the
   * dialog says so. Without it the item is bought with points.
   */
  coupon?: { code: string } | null;
  /** Points the member can spend, for the summary line. */
  balance?: number;
  /** For virtual items: where the code is emailed. */
  email?: string;
  /** Pre-fills the name field. */
  defaultName?: string;
  /** Does the checkout. Resolve to close the dialog; throw to keep it open. */
  onSubmit: (request: RedeemRequest) => Promise<void>;
}

/**
 * The checkout every physical order goes through: ship or collect, and the
 * contact details for either. The store uses it to spend points, and prize
 * winners use it, with their coupon, to claim their prize.
 */
export function CheckoutDialog({
  open, onOpenChange, item, coupon, balance, email, defaultName, onSubmit,
}: CheckoutDialogProps) {
  const { user } = useAuth();
  const memoryKey = user?.id ?? '';
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Read when the dialog opens, so a profile refresh mid-checkout never
  // resets what the member is typing.
  const opening = useRef({ memoryKey, defaultName });
  opening.current = { memoryKey, defaultName };

  // Each opening starts a fresh checkout, with this member's last details.
  useEffect(() => {
    if (!open) return;
    const remembered = rememberedContacts.get(opening.current.memoryKey) ?? EMPTY_CONTACT;
    setFulfillment(null);
    setContact({ ...remembered, name: remembered.name || opening.current.defaultName || '' });
    setNotes('');
    setShowErrors(false);
  }, [open]);

  const isPhysical = item ? item.itemType !== 'virtual' : false;
  const errors = useMemo(
    () => (isPhysical ? checkoutErrors(fulfillment, contact) : {}),
    [isPhysical, fulfillment, contact],
  );
  const shownErrors: CheckoutErrors = showErrors ? errors : {};

  const setField = (field: keyof Contact) => (e: ChangeEvent<HTMLInputElement>) =>
    setContact((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!item) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    const trimmed = Object.fromEntries(Object.entries(contact).map(([k, v]) => [k, v.trim()])) as Contact;
    const request: RedeemRequest = !isPhysical ? {} : {
      fulfillmentMethod: fulfillment!,
      shippingAddress: fulfillment === 'ship' ? trimmed : { name: trimmed.name, phone: trimmed.phone },
      notes: notes.trim() || undefined,
    };
    setSubmitting(true);
    try {
      await onSubmit(request);
      if (memoryKey && isPhysical) rememberedContacts.set(memoryKey, trimmed);
      onOpenChange(false);
    } catch {
      // The caller has shown the error. The dialog stays open to fix it.
    } finally {
      setSubmitting(false);
    }
  };

  /** Error text under a field, linked to it for screen readers. */
  const fieldError = (field: keyof CheckoutErrors) =>
    shownErrors[field] ? (
      <p id={`${field}-error`} className="text-xs text-destructive">{shownErrors[field]}</p>
    ) : null;
  const errorProps = (field: keyof Contact) => ({
    'aria-invalid': Boolean(shownErrors[field]),
    'aria-describedby': shownErrors[field] ? `${field}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{coupon ? `Claim your ${item?.name ?? 'prize'}` : `Redeem ${item?.name ?? ''}`}</DialogTitle>
          <DialogDescription>
            {coupon
              ? 'Your Kiro University prize. Tell us how you would like to get it.'
              : `This uses ${item?.points.toLocaleString()} of your ${(balance ?? 0).toLocaleString()} points.`}
          </DialogDescription>
        </DialogHeader>

        {coupon && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <Ticket className="h-4 w-4 !text-green-700" />
            <AlertTitle className="text-green-800 dark:text-green-300">
              Prize coupon <span className="font-mono">{coupon.code}</span> applied
            </AlertTitle>
            <AlertDescription className="text-sm text-green-800 dark:text-green-300">
              No points are taken from your balance.
            </AlertDescription>
          </Alert>
        )}

        {!isPhysical ? (
          <p className="text-sm text-muted-foreground py-2">
            Your code is emailed to {email || 'your email address'} and appears in your
            profile under this order.
          </p>
        ) : (
          <div className="grid gap-5 py-2">
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-medium">How would you like to get it?</legend>
              <RadioGroup
                value={fulfillment ?? ''}
                onValueChange={(v) => setFulfillment(v as FulfillmentMethod)}
                aria-describedby={shownErrors.fulfillment ? 'fulfillment-error' : undefined}
                className="grid gap-3"
              >
                {FULFILLMENT_OPTIONS.map(({ value, title, hint, icon: Icon }) => (
                  <Label
                    key={value}
                    htmlFor={`fulfillment-${value}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal transition-colors hover:bg-muted/50 ${
                      fulfillment === value ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <RadioGroupItem id={`fulfillment-${value}`} value={value} className="mt-0.5" />
                    <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{title}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
              {fieldError('fulfillment')}
            </fieldset>

            {fulfillment === 'ship' && (
              <Alert className="border-amber-500/50 bg-amber-500/10">
                <CalendarClock className="h-4 w-4 !text-amber-600" />
                <AlertTitle>Ships in {SHIPPING_WINDOW}</AlertTitle>
                <AlertDescription className="text-sm">
                  We post orders together in {SHIPPING_WINDOW}, so it won&apos;t arrive before
                  then. If you would rather have it sooner, collect it at our next in-person event.
                </AlertDescription>
              </Alert>
            )}

            {fulfillment === 'pickup' && (
              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertTitle>We&apos;ll keep it for you</AlertTitle>
                <AlertDescription className="text-sm">
                  Collect it from the organisers at our next in-person event. We&apos;ll use the
                  mobile number below if we need to reach you about it.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="checkout-name">Full name</Label>
                  <Input
                    id="checkout-name"
                    autoComplete="name"
                    value={contact.name}
                    onChange={setField('name')}
                    {...errorProps('name')}
                  />
                  {fieldError('name')}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="checkout-phone">Mobile number</Label>
                  <Input
                    id="checkout-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={contact.phone}
                    onChange={setField('phone')}
                    placeholder="98765 43210"
                    {...errorProps('phone')}
                  />
                  {fieldError('phone')}
                </div>
              </div>

              {fulfillment === 'ship' && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="checkout-address">Address</Label>
                    <Input
                      id="checkout-address"
                      autoComplete="street-address"
                      value={contact.address}
                      onChange={setField('address')}
                      placeholder="House number, street and area"
                      {...errorProps('address')}
                    />
                    {fieldError('address')}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="checkout-city">City</Label>
                      <Input
                        id="checkout-city"
                        autoComplete="address-level2"
                        value={contact.city}
                        onChange={setField('city')}
                        {...errorProps('city')}
                      />
                      {fieldError('city')}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="checkout-state">State</Label>
                      <Input
                        id="checkout-state"
                        autoComplete="address-level1"
                        value={contact.state}
                        onChange={setField('state')}
                        {...errorProps('state')}
                      />
                      {fieldError('state')}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="checkout-zipCode">PIN code</Label>
                      <Input
                        id="checkout-zipCode"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={7}
                        value={contact.zipCode}
                        onChange={setField('zipCode')}
                        placeholder="625001"
                        {...errorProps('zipCode')}
                      />
                      {fieldError('zipCode')}
                    </div>
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="checkout-notes">
                  Note for the organisers <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="checkout-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="For example, your T-shirt or jacket size"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !item}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {coupon ? 'Claiming...' : 'Redeeming...'}
              </>
            ) : coupon ? (
              `Claim ${item?.name ?? 'prize'}`
            ) : (
              'Confirm Redemption'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
