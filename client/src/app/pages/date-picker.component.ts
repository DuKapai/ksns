import { ChangeDetectorRef, Component, ElementRef, forwardRef, HostListener, Input, ViewChild } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';

interface CalendarDay { day: number; value: string; }

@Component({
  selector: 'app-date-picker',
  standalone: true,
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.css',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DatePickerComponent), multi: true },
  ],
})
export class DatePickerComponent implements ControlValueAccessor, Validator {
  @Input() label = 'Ngày';
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('calendar') private calendar?: ElementRef<HTMLDialogElement>;

  constructor(private changeDetector: ChangeDetectorRef) {}

  private minValue = '';
  private maxValue = '';
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  @Input() set min(value: string | null | undefined) {
    this.minValue = value || '';
    this.onValidatorChange();
  }
  @Input() set max(value: string | null | undefined) {
    this.maxValue = value || '';
    this.onValidatorChange();
  }

  value = '';
  disabled = false;
  year = 0;
  month = 0;
  days: (CalendarDay | null)[] = [];
  readonly weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  get today(): string { return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }

  get displayValue(): string {
    return this.validDate(this.value) ? `${this.value.slice(8, 10)}/${this.value.slice(5, 7)}/${this.value.slice(0, 4)}` : 'Chọn ngày';
  }
  get monthText(): string { return `Tháng ${this.month}/${this.year}`; }
  canShift(delta: number): boolean {
    const month = this.shiftedMonth(delta);
    return month !== null && (!this.minValue || month >= this.minValue.slice(0, 7)) &&
      (!this.maxValue || month <= this.maxValue.slice(0, 7));
  }

  writeValue(value: string | null): void { this.value = value || ''; }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled && this.calendar?.nativeElement.open) this.close(false);
  }
  registerOnValidatorChange(fn: () => void): void { this.onValidatorChange = fn; }
  validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;
    if (typeof value !== 'string' || !this.validDate(value)) return { date: true };
    if (this.minValue && value < this.minValue) return { dateMin: { min: this.minValue, actual: value } };
    if (this.maxValue && value > this.maxValue) return { dateMax: { max: this.maxValue, actual: value } };
    return null;
  }

  open(): void {
    if (this.disabled || !this.calendar || this.calendar.nativeElement.open) return;
    let active = this.validDate(this.value) ? this.value : this.today;
    if (this.minValue && active < this.minValue) active = this.minValue;
    if (this.maxValue && active > this.maxValue) active = this.maxValue;
    this.year = Number(active.slice(0, 4));
    this.month = Number(active.slice(5, 7));
    this.buildDays();
    this.changeDetector.detectChanges();
    this.calendar.nativeElement.showModal();
    this.positionCalendar();
    const selected = this.calendar.nativeElement.querySelector<HTMLButtonElement>('.calendar-day.selected:not(:disabled)');
    const first = this.calendar.nativeElement.querySelector<HTMLButtonElement>('.calendar-day:not(:disabled)');
    (selected || first)?.focus({ preventScroll: true });
  }
  close(restoreFocus = true): void {
    if (this.calendar?.nativeElement.open) this.calendar.nativeElement.close();
    this.onTouched();
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }
  cancel(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }
  backdropClick(event: MouseEvent): void {
    if (event.target !== this.calendar?.nativeElement) return;
    const bounds = this.calendar.nativeElement.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }
  @HostListener('window:resize')
  positionCalendar(): void {
    const dialog = this.calendar?.nativeElement;
    const trigger = this.trigger?.nativeElement;
    if (!dialog?.open || !trigger) return;
    const anchor = trigger.getBoundingClientRect();
    const width = dialog.offsetWidth;
    const height = dialog.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const below = anchor.bottom + 8;
    const top = below + height <= window.innerHeight - 8 ? below
      : Math.max(8, Math.min(anchor.top - height - 8, window.innerHeight - height - 8));
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }
  changeMonth(delta: number): void {
    const value = this.shiftedMonth(delta);
    if (!value || !this.canShift(delta)) return;
    this.year = Number(value.slice(0, 4));
    this.month = Number(value.slice(5, 7));
    this.buildDays();
    this.changeDetector.detectChanges();
    this.positionCalendar();
  }
  unavailable(value: string): boolean {
    return !!((this.minValue && value < this.minValue) || (this.maxValue && value > this.maxValue));
  }
  select(value: string): void {
    if (value && (!this.validDate(value) || this.unavailable(value))) return;
    this.value = value;
    this.onChange(value);
    this.close();
  }

  private buildDays(): void {
    const first = new Date(0);
    first.setFullYear(this.year, this.month - 1, 1);
    first.setHours(12, 0, 0, 0);
    const last = new Date(0);
    last.setFullYear(this.year, this.month, 0);
    last.setHours(12, 0, 0, 0);
    const offset = (first.getDay() + 6) % 7;
    const prefix = `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}`;
    this.days = [
      ...Array<null>(offset).fill(null),
      ...Array.from({ length: last.getDate() }, (_, index) => ({
        day: index + 1, value: `${prefix}-${String(index + 1).padStart(2, '0')}`,
      })),
    ];
  }
  private shiftedMonth(delta: number): string | null {
    const total = (this.year - 1) * 12 + this.month - 1 + delta;
    if (total < 0 || total >= 9999 * 12) return null;
    return `${String(Math.floor(total / 12) + 1).padStart(4, '0')}-${String(total % 12 + 1).padStart(2, '0')}`;
  }
  private validDate(value: string): boolean {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) || value.startsWith('0000-')) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }
}
