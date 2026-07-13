"use client";

import { useMemo, useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { checkInAction, lookupGuestAction, type CheckInActionState } from "./actions";
import { computeExpectedCheckOut, formatMoney, calculateAge, isExpired } from "@/lib/checkin/rate";

type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  checkOutTime: string;
  registrationCardFooterText: string | null;
};

type Room = { id: string; roomNumber: string; roomTypeName: string };
type RatePlan = { id: string; name: string; unit: "hourly" | "nightly" | "weekly"; durationUnits: number; baseAmount: number };

type DuplicateGuest = {
  id: string;
  firstName: string;
  lastName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  dnrFlag: boolean;
  dnrReason: string | null;
  stayCount: number;
  lastStayAt: Date | null;
};

const initialState: CheckInActionState = {};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const inputClasses =
  "rounded border border-gray-400 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function CheckInForm({
  property,
  rooms,
  ratePlans,
  preselectedRoomId,
}: {
  property: Property;
  rooms: Room[];
  ratePlans: RatePlan[];
  preselectedRoomId?: string;
}) {
  const [state, formAction, pending] = useActionState(checkInAction, initialState);

  const [roomId, setRoomId] = useState(preselectedRoomId ?? rooms[0]?.id ?? "");
  const [ratePlanId, setRatePlanId] = useState(ratePlans.find((r) => r.unit === "nightly")?.id ?? ratePlans[0]?.id ?? "");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiration, setIdExpiration] = useState("");
  const [dob, setDob] = useState("");
  const [dnrOverride, setDnrOverride] = useState(false);

  const [duplicate, setDuplicate] = useState<DuplicateGuest | null>(null);
  const [checkedIdNumber, setCheckedIdNumber] = useState<string | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");

  const selectedRatePlan = ratePlans.find((r) => r.id === ratePlanId);
  const now = useMemo(() => new Date(), []);
  const expectedCheckOut = useMemo(() => {
    if (!selectedRatePlan) return null;
    return computeExpectedCheckOut(selectedRatePlan, now, property.checkOutTime);
  }, [selectedRatePlan, now, property.checkOutTime]);

  const idExpiredWarning = idExpiration && isExpired(new Date(idExpiration));
  const under18Warning = dob && calculateAge(new Date(dob)) < 18;

  function handleIdNumberBlur() {
    const trimmed = idNumber.trim();
    if (!trimmed || trimmed === checkedIdNumber) return;
    startLookup(async () => {
      const result = await lookupGuestAction(property.id, trimmed);
      setCheckedIdNumber(trimmed);
      setDuplicate(result);
    });
  }

  function loadDuplicateInfo() {
    if (!duplicate) return;
    setFirstName(duplicate.firstName);
    setLastName(duplicate.lastName);
    setAddressLine1(duplicate.addressLine1 ?? "");
    setCity(duplicate.city ?? "");
    setAddrState(duplicate.state ?? "");
    setZip(duplicate.zip ?? "");
    setPhone(duplicate.phone ?? "");
  }

  const blockedByDnr = !!duplicate?.dnrFlag && !dnrOverride;

  return (
    <main className="flex flex-1 justify-center bg-gray-100 p-4 dark:bg-gray-950 sm:p-8">
      <form action={formAction} className="w-full max-w-3xl">
        <input type="hidden" name="propertyId" value={property.id} />
        <input type="hidden" name="roomId" value={roomId} />
        <input type="hidden" name="ratePlanId" value={ratePlanId} />
        <input type="hidden" name="dnrOverride" value={dnrOverride ? "on" : ""} />

        <div className="printable-card rounded-lg border-2 border-gray-800 bg-white p-6 text-gray-900 shadow-sm">
          {/* 1. Property header */}
          <div className="border-b-2 border-gray-800 pb-3 text-center">
            <h1 className="text-xl font-bold tracking-wide">{property.name}</h1>
            <p className="text-sm text-gray-600">
              {property.address}, {property.city}, {property.state} {property.zip} · {property.phone}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gray-500">Guest Registration Card</p>
          </div>

          {/* 2. Scan strip */}
          <div className="no-print mt-4">
            <input
              type="text"
              disabled
              placeholder="Barcode scanning available in a future update — enter details manually below"
              className="w-full rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-400"
            />
          </div>

          {/* Duplicate / DNR banner */}
          {isLookingUp && <p className="mt-3 text-xs text-gray-500">Checking for a returning guest…</p>}
          {duplicate && !duplicate.dnrFlag && (
            <div className="mt-3 flex items-center justify-between rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span>
                Returning guest: <strong>{duplicate.firstName} {duplicate.lastName}</strong>
                {duplicate.lastStayAt && <> — last stayed {duplicate.lastStayAt.toLocaleDateString()}</>}, {duplicate.stayCount} previous stay{duplicate.stayCount === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={loadDuplicateInfo} className="no-print rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                Load their info
              </button>
            </div>
          )}
          {duplicate?.dnrFlag && (
            <div className="mt-3 rounded border-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900">
              <p className="font-bold">DO NOT RENT — {duplicate.firstName} {duplicate.lastName}</p>
              {duplicate.dnrReason && <p>Reason: {duplicate.dnrReason}</p>}
              <label className="no-print mt-2 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={dnrOverride} onChange={(e) => setDnrOverride(e.target.checked)} />
                Owner override entered — proceed anyway
              </label>
            </div>
          )}

          {/* 3. Guest block */}
          <fieldset className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="First Name">
              <input name="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Middle Name">
              <input name="middleName" className={inputClasses} />
            </Field>
            <Field label="Last Name">
              <input name="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Address">
              <input name="addressLine1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="City">
              <input name="city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClasses} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input name="state" value={addrState} onChange={(e) => setAddrState(e.target.value)} maxLength={2} className={inputClasses} />
              </Field>
              <Field label="Zip">
                <input name="zip" value={zip} onChange={(e) => setZip(e.target.value)} className={inputClasses} />
              </Field>
            </div>
            <Field label="Date of Birth">
              <input type="date" name="dob" value={dob} onChange={(e) => setDob(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Phone">
              <input type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClasses} />
            </Field>
            <Field label="Email">
              <input type="email" name="email" className={inputClasses} />
            </Field>
          </fieldset>
          {under18Warning && (
            <p className="mt-1 text-xs font-semibold text-amber-600">⚠ Guest is under 18 — owner&apos;s discretion.</p>
          )}

          {/* 4. ID block */}
          <fieldset className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 sm:grid-cols-4">
            <Field label="ID Type">
              <select name="idType" className={inputClasses} defaultValue="drivers_license">
                <option value="drivers_license">Driver&apos;s License</option>
                <option value="state_id">State ID</option>
                <option value="passport">Passport</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="ID Number">
              <input
                name="idNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                onBlur={handleIdNumberBlur}
                className={inputClasses}
              />
            </Field>
            <Field label="ID State">
              <input name="idState" maxLength={2} className={inputClasses} />
            </Field>
            <Field label="ID Expiration">
              <input
                type="date"
                name="idExpiration"
                value={idExpiration}
                onChange={(e) => setIdExpiration(e.target.value)}
                className={inputClasses}
              />
            </Field>
          </fieldset>
          {idExpiredWarning && <p className="mt-1 text-xs font-semibold text-amber-600">⚠ This ID has expired — do not block check-in.</p>}

          {/* 5. Vehicle block */}
          <fieldset className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 sm:grid-cols-5">
            <Field label="Make">
              <input name="vehicleMake" className={inputClasses} />
            </Field>
            <Field label="Model">
              <input name="vehicleModel" className={inputClasses} />
            </Field>
            <Field label="Color">
              <input name="vehicleColor" className={inputClasses} />
            </Field>
            <Field label="Plate">
              <input name="vehiclePlate" className={inputClasses} />
            </Field>
            <Field label="State">
              <input name="vehicleState" maxLength={2} className={inputClasses} />
            </Field>
          </fieldset>

          {/* 6. Stay block */}
          <fieldset className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 sm:grid-cols-4">
            <Field label="Room">
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputClasses}>
                {rooms.length === 0 && <option value="">No vacant rooms</option>}
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber} — {r.roomTypeName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rate Plan">
              <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className={inputClasses}>
                {ratePlans.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} ({rp.unit === "hourly" ? "H" : rp.unit === "nightly" ? "D" : "W"}) — {formatMoney(rp.baseAmount)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Check-In">
              <div className={`${inputClasses} bg-gray-50 text-gray-500`}>{now.toLocaleString()}</div>
            </Field>
            <Field label="Expected Check-Out">
              <div className={`${inputClasses} bg-gray-50 text-gray-500`}>
                {expectedCheckOut ? expectedCheckOut.toLocaleString() : "—"}
              </div>
            </Field>
            <Field label="Adults">
              <input type="number" name="adults" min={1} defaultValue={1} className={inputClasses} />
            </Field>
            <Field label="Children">
              <input type="number" name="children" min={0} defaultValue={0} className={inputClasses} />
            </Field>
            <div className="col-span-2 sm:col-span-2">
              <Field label="Additional Occupants (comma separated)">
                <input name="additionalGuests" className={inputClasses} />
              </Field>
            </div>
          </fieldset>

          {/* 7. Rate block */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
            <span className="text-gray-600">
              Room {rooms.find((r) => r.id === roomId)?.roomNumber ?? "—"} — {selectedRatePlan?.name ?? "—"}
            </span>
            <span className="font-bold">Total: {selectedRatePlan ? formatMoney(selectedRatePlan.baseAmount) : "—"}</span>
          </div>
          <p className="text-right text-[11px] text-gray-400">Tax calculation coming in a future update.</p>

          {/* 8. Terms footer */}
          {property.registrationCardFooterText && (
            <p className="mt-4 border-t border-gray-200 pt-3 text-[11px] text-gray-500">{property.registrationCardFooterText}</p>
          )}
        </div>

        {/* 9. Buttons */}
        <div className="no-print mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            title="Coming with the payment integration (slice 5)"
            className="cursor-not-allowed rounded-md bg-gray-300 px-4 py-2 text-sm font-semibold text-gray-500"
          >
            CHECK IN & TAKE PAYMENT
          </button>
          <button
            type="submit"
            disabled={pending || blockedByDnr || rooms.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {pending ? "Checking in…" : "CHECK IN — BILL LATER"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-gray-400 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            PRINT REG CARD
          </button>
          <Link href="/" className="ml-auto text-sm text-gray-500 hover:underline">
            Cancel
          </Link>
        </div>

        {state.error && <p className="no-print mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      </form>
    </main>
  );
}
