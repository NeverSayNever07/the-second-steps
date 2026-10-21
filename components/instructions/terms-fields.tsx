"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import {
  DEPOSIT_OFFERING_LABELS,
  FEE_FREQUENCY_LABELS,
  FEE_VAT_LABELS,
  penceToField,
  RENT_PERIOD_LABELS,
} from "@/core/instructions/domain/instruction-labels";
import { LETTING_SERVICE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import {
  INSTRUCTION_LIMITS,
  type TermsInput,
} from "@/core/instructions/domain/instruction";
import { calculateFiveWeekDepositPence } from "@/core/instructions/domain/deposit";
import { parsePounds } from "@/core/enquiries/domain/enquiry";

export type TermsFieldValues = TermsInput;

export const EMPTY_TERMS: TermsFieldValues = {
  service: "",
  askingRent: "",
  rentPeriod: "month",
  feeKind: "",
  feeValue: "",
  feeFrequency: "",
  feeVat: "",
  depositOffering: "",
  deposit: "",
  holdingDeposit: "",
  charges: [],
};

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={`${id}-error`} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

function Money({
  id,
  label,
  defaultValue,
  error,
  hint,
  value,
  onValueChange,
}: {
  id: string;
  label: string;
  defaultValue: string;
  error?: string;
  hint?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
        >
          £
        </span>
        <Input
          id={id}
          name={id}
          inputMode="decimal"
          autoComplete="off"
          className="pl-7"
          defaultValue={value === undefined ? defaultValue : undefined}
          value={value}
          onChange={
            onValueChange
              ? (event) => onValueChange(event.currentTarget.value)
              : undefined
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

/**
 * The commercial terms of an instruction, as one set of fields. Used on the
 * Start instruction review and in Manage terms, so both ask the same things.
 * Rent, fee and deposit may be left empty; the instruction is then incomplete.
 */
export function TermsFields({
  values,
  errors = {},
}: {
  values: TermsFieldValues;
  errors?: Partial<Record<string, string>>;
}) {
  const [feeKind, setFeeKind] = useState(values.feeKind);
  const [offering, setOffering] = useState(values.depositOffering);
  const [askingRent, setAskingRent] = useState(values.askingRent);
  const [rentPeriod, setRentPeriod] = useState(values.rentPeriod || "month");
  const [deposit, setDeposit] = useState(values.deposit);
  const [charges, setCharges] = useState(
    values.charges.map((charge, index) => ({ ...charge, key: index })),
  );
  const [nextKey, setNextKey] = useState(values.charges.length);
  const standardOffered = offering === "standard" || offering === "both";

  function fiveWeekDeposit(rent: string, period: string): string {
    const rentPence = parsePounds(rent);
    if (rentPence === null || (period !== "month" && period !== "week")) {
      return "";
    }
    return penceToField(calculateFiveWeekDepositPence(rentPence, period));
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4" aria-labelledby="terms-service">
        <h3 id="terms-service" className="text-sm font-semibold">
          Service and rent
        </h3>
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem]">
          <div className="grid gap-2">
            <Label htmlFor="service">Service</Label>
            <OptionSelect
              id="service"
              name="service"
              required
              placeholder="Choose a service"
              defaultValue={values.service}
              options={options(LETTING_SERVICE_LABELS)}
            />
            <FieldError id="service" message={errors.service} />
          </div>
          <Money
            id="askingRent"
            label="Agreed asking rent"
            defaultValue={values.askingRent}
            error={errors.askingRent}
            hint="Needed before Ready to market. The tenancy's actual rent is recorded separately."
            value={askingRent}
            onValueChange={(next) => {
              setAskingRent(next);
              if (standardOffered) {
                setDeposit(fiveWeekDeposit(next, rentPeriod));
              }
            }}
          />
          <div className="grid gap-2">
            <Label htmlFor="rentPeriod">Rent is</Label>
            <OptionSelect
              id="rentPeriod"
              name="rentPeriod"
              value={rentPeriod}
              onValueChange={(next) => {
                setRentPeriod(next);
                if (standardOffered) {
                  setDeposit(fiveWeekDeposit(askingRent, next));
                }
              }}
              options={options(RENT_PERIOD_LABELS)}
            />
            <FieldError id="rentPeriod" message={errors.rentPeriod} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 border-t pt-5" aria-labelledby="terms-fee">
        <h3 id="terms-fee" className="text-sm font-semibold">
          Agency fee
        </h3>
        <div className="grid items-start gap-4 md:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="feeKind">Fee type</Label>
            <OptionSelect
              id="feeKind"
              name="feeKind"
              value={feeKind}
              onValueChange={setFeeKind}
              placeholder="Not agreed yet"
              options={[
                { value: "", label: "Not agreed yet" },
                { value: "percentage", label: "Percentage of the rent" },
                { value: "fixed", label: "Fixed amount" },
              ]}
            />
            <FieldError id="feeKind" message={errors.feeKind} />
          </div>
          {feeKind === "percentage" && (
            <div className="grid gap-2">
              <Label htmlFor="feeValue">Percentage</Label>
              <div className="relative">
                <Input
                  id="feeValue"
                  name="feeValue"
                  inputMode="decimal"
                  autoComplete="off"
                  className="pr-8"
                  defaultValue={
                    values.feeKind === "percentage" ? values.feeValue : ""
                  }
                  aria-invalid={Boolean(errors.feeValue)}
                  aria-describedby={
                    errors.feeValue ? "feeValue-error" : undefined
                  }
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                >
                  %
                </span>
              </div>
              <FieldError id="feeValue" message={errors.feeValue} />
            </div>
          )}
          {feeKind === "fixed" && (
            <Money
              id="feeValue"
              label="Fee amount"
              defaultValue={values.feeKind === "fixed" ? values.feeValue : ""}
              error={errors.feeValue}
            />
          )}
          {feeKind !== "" && (
            <div className="grid gap-2">
              <Label htmlFor="feeFrequency">How often</Label>
              <OptionSelect
                id="feeFrequency"
                name="feeFrequency"
                placeholder="Choose how often"
                defaultValue={values.feeFrequency}
                options={options(FEE_FREQUENCY_LABELS)}
              />
              <FieldError id="feeFrequency" message={errors.feeFrequency} />
            </div>
          )}
          {feeKind !== "" && (
            <div className="grid gap-2">
              <Label htmlFor="feeVat">VAT</Label>
              <OptionSelect
                id="feeVat"
                name="feeVat"
                placeholder="How does VAT apply?"
                defaultValue={values.feeVat}
                options={options(FEE_VAT_LABELS)}
              />
              <FieldError id="feeVat" message={errors.feeVat} />
            </div>
          )}
        </div>
      </section>

      <section
        className="grid gap-4 border-t pt-5"
        aria-labelledby="terms-deposit"
      >
        <h3 id="terms-deposit" className="text-sm font-semibold">
          Deposit offered
        </h3>
        <p className="text-xs text-muted-foreground">
          This records what is proposed to tenants. Zayto does not check amounts
          against deposit limits, and the deposit itself and its protection are
          handled later.
        </p>
        <div className="grid items-start gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="depositOffering">Offering</Label>
            <OptionSelect
              id="depositOffering"
              name="depositOffering"
              value={offering}
              onValueChange={(next) => {
                setOffering(next);
                const offersStandard = next === "standard" || next === "both";
                if (offersStandard) {
                  setDeposit(fiveWeekDeposit(askingRent, rentPeriod));
                }
              }}
              placeholder="Not decided yet"
              options={[
                { value: "", label: "Not decided yet" },
                ...options(DEPOSIT_OFFERING_LABELS),
              ]}
            />
            <FieldError id="depositOffering" message={errors.depositOffering} />
          </div>
          {standardOffered && (
            <Money
              id="deposit"
              label="Tenancy deposit"
              defaultValue={values.deposit}
              value={deposit}
              onValueChange={setDeposit}
              error={errors.deposit}
              hint="Calculated as five weeks' rent. You can amend it if needed."
            />
          )}
          {!standardOffered && (
            <div className="hidden md:block" aria-hidden="true" />
          )}
          <Money
            id="holdingDeposit"
            label="Holding deposit (optional)"
            defaultValue={values.holdingDeposit}
            error={errors.holdingDeposit}
          />
        </div>
      </section>

      <section
        className="grid gap-4 border-t pt-5"
        aria-labelledby="terms-charges"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="terms-charges" className="text-sm font-semibold">
            Other charges (optional)
          </h3>
          {charges.length < INSTRUCTION_LIMITS.charges && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCharges([
                  ...charges,
                  { key: nextKey, name: "", amount: "", vat: "" },
                ]);
                setNextKey(nextKey + 1);
              }}
            >
              <Plus aria-hidden="true" />
              Add a charge
            </Button>
          )}
        </div>
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None. Add fixed charges such as a setup or tenancy fee.
          </p>
        ) : (
          <ul className="grid gap-4">
            {charges.map((charge, index) => (
              <li
                key={charge.key}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] md:items-end"
              >
                <div className="grid gap-2">
                  <Label htmlFor={`chargeName-${charge.key}`}>
                    Charge {index + 1}
                  </Label>
                  <Input
                    id={`chargeName-${charge.key}`}
                    name="chargeName"
                    autoComplete="off"
                    maxLength={INSTRUCTION_LIMITS.chargeName}
                    defaultValue={charge.name}
                    placeholder="For example, Setup fee"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`chargeAmount-${charge.key}`}>Amount</Label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
                    >
                      £
                    </span>
                    <Input
                      id={`chargeAmount-${charge.key}`}
                      name="chargeAmount"
                      inputMode="decimal"
                      autoComplete="off"
                      className="pl-7"
                      defaultValue={charge.amount}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`chargeVat-${charge.key}`}>VAT</Label>
                  <OptionSelect
                    id={`chargeVat-${charge.key}`}
                    name="chargeVat"
                    placeholder="VAT"
                    defaultValue={charge.vat}
                    options={options(FEE_VAT_LABELS)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove charge ${index + 1}`}
                  onClick={() =>
                    setCharges(
                      charges.filter((item) => item.key !== charge.key),
                    )
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FieldError id="charges" message={errors.charges} />
      </section>
    </div>
  );
}
