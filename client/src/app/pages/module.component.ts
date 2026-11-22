import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { ApiService, User } from '../core/api.service';

interface Task { id: string; title: string; area: string; dueDate?: string; }
interface Person { employeeCode: string; fullName: string; departmentName: string; }
interface Context {
  canRecord: boolean; isNetworkReader: boolean; seesAll: boolean; canManage: boolean; reportDay: number;
  tasks: Task[]; people: Person[];
}
interface Summary {
  monitoringCount: number; risksFound: number; risksClosed: number; closureRate: number | null;
  categories: { name: string; total: number; closed: number; share: number | null; rate: number | null }[];
  compliance: { name: string; total: number; met: number; rate: number | null }[];
}
interface Notice { id: string; text: string; urgent: boolean; section: string; riskId?: string; recipient?: string; reportMonth?: string; }
interface Overview {
  summary: Summary;
  work: {
    due: number; unscheduled: number; new: number; processing: number; waiting: number; overdue: number;
    reportMonth: string; reportDue: string; reportRequired: number; reportConfirmed: number;
    reportMissing: { fullName: string; departmentName: string }[]; ownReportConfirmed: boolean; ownReportRequired: boolean;
  };
  tasks: Task[]; notices: Notice[];
  activity: { id: string; title: string; by: string; at: string; status: string; action: string }[];
}
interface Issue {
  id: string; code: string; title: string; category: string; severity: string;
  description: string; status: string; createdAt: string; departmentName: string; reporter: string;
  subjectName?: string; subjectEmployeeCode?: string; assignedTo: string; dueDate: string; immediateAction: string;
  correction: string; verification: string; responseMonth: string; responseOpen: boolean; canRespond: boolean;
  responses?: { id: string; by: string; at: string; explanation: string; evidence: string }[];
  timeline?: { at: string; by: string; action: string }[];
}
interface Monitoring { id: string; date: string; area: string; observer: string; sampleSize: number; compliant: number; findings: string; }
interface Report {
  id: string; month: string; departmentCode: string; departmentName: string; submittedBy: string; createdAt: string; employeeCode?: string;
  monitoringCount: number; risksFound: number; risksClosed: number;
}
interface Member { id: string; employeeCode: string; fullName: string; departmentName: string; memberType: string; active: boolean; }
interface Department { makhoa: string; tenkhoa: string; }
interface LogEntry { id: string; at: string; user: string; action: string; }
interface Todo { key: string; text: string; note: string; urgent: boolean; button: string; run: () => void; }
interface StatRow { name: string; checked: number; met: number; rate: number | null; issues: number; share: number | null; closed: number; closedRate: number | null; }
type Step = 'respond' | 'accept' | 'correct' | 'verify';

const SECTIONS = ['dashboard', 'risks', 'monitorings', 'reports', 'manage'];
// Old bookmarks still open the matching simple page instead of the retired screens.
const OLD_LINKS: Record<string, string> = { members: 'manage', audit: 'manage', settings: 'manage', doctor: 'monitorings', surveillance: 'monitorings' };
const STATUS: Record<string, string> = {
  'Mới ghi nhận': 'Chờ tiếp nhận', 'Đã tiếp nhận': 'Đang xử lý', 'Đang khắc phục': 'Đang xử lý',
  'Chờ kiểm tra lại': 'Chờ xác nhận', 'Đã đóng': 'Hoàn thành', 'Đã gửi': 'Đã xác nhận',
};
const FILTERS: Record<string, (issue: Issue) => boolean> = {
  new: (issue) => issue.status === 'Mới ghi nhận',
  processing: (issue) => ['Đã tiếp nhận', 'Đang khắc phục'].includes(issue.status),
  waiting: (issue) => issue.status === 'Chờ kiểm tra lại',
  done: (issue) => issue.status === 'Đã đóng',
  tracking: (issue) => ['Đã tiếp nhận', 'Đang khắc phục', 'Chờ kiểm tra lại'].includes(issue.status),
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './module.component.html',
  styleUrl: './module.component.css',
})
export class ModuleComponent implements OnInit, OnDestroy {
  user: User | null = null;
  context: Context | null = null;
  overview: Overview | null = null;
  section = 'dashboard';
  loading = true;
  saving = false;
  error = '';
  success = '';
  period = 'month';
  today = this.localDate();
  from = `${this.today.slice(0, 7)}-01`;
  to = this.today;
  reportMonth = this.previousMonth();
  reportSummary: Summary | null = null;
  summaryLoading = false;
  recommendation = '';
  issues: Issue[] = [];
  monitorings: Monitoring[] = [];
  reports: Report[] = [];
  members: Member[] = [];
  departments: Department[] = [];
  logs: LogEntry[] = [];
  todos: Todo[] = [];
  stats: StatRow[] = [];
  search = '';
  status = '';
  focusId = '';
  showAllTodos = false;
  showNotices = false;
  modal = '';
  selected: Issue | null = null;
  persona = 'doctor';
  manageView = 'members';
  reportDay = 5;
  response = { explanation: '', evidence: '' };
  action = { correction: '', evidence: '', verification: '', passed: true };
  monitoringForm = this.newMonitoring();
  issueForm = this.newIssue();
  memberForm = this.newMember();
  readonly areas = ['Vệ sinh tay', 'Phương tiện phòng hộ cá nhân', 'Phòng ngừa chuẩn/cách ly', 'Thiết bị xâm lấn',
    'Vệ sinh môi trường/khử khuẩn bề mặt', 'Khử khuẩn/tiệt khuẩn dụng cụ', 'Chất thải y tế', 'Tiêm an toàn', 'Phơi nhiễm/vật sắc nhọn', 'Khác'];
  readonly levels = [
    { value: 'Thấp', label: 'Nhẹ', badge: 'Mức nhẹ', hint: 'Nhắc tại chỗ, theo dõi thêm' },
    { value: 'Trung bình', label: 'Trung bình', badge: 'Mức trung bình', hint: 'Khoa cần khắc phục trong hạn' },
    { value: 'Cao', label: 'Nguy hiểm', badge: 'Nguy hiểm', hint: 'Báo ngay lãnh đạo khoa và Khoa KSNK' },
  ];
  readonly periods = [{ value: 'month', label: 'Tháng này' }, { value: 'quarter', label: 'Quý này' },
    { value: 'half', label: '6 tháng' }, { value: 'year', label: 'Năm nay' }, { value: 'custom', label: 'Chọn ngày' }];
  readonly filters = [{ value: '', label: 'Tất cả' }, { value: 'new', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' },
    { value: 'waiting', label: 'Chờ xác nhận' }, { value: 'overdue', label: 'Quá hạn' }, { value: 'done', label: 'Hoàn thành' }];
  readonly memberTypes = ['Bác sĩ', 'Điều dưỡng', 'Hộ sinh', 'Kỹ thuật y', 'Lãnh đạo đơn vị', 'KSNK'];
  readonly personas = [{ value: 'doctor', label: 'Thành viên mạng lưới' }, { value: 'staff', label: 'Nhân viên y tế' }, { value: 'ksnk', label: 'Khoa KSNK' }];
  readonly stepLabel: Record<Step, string> = { respond: 'Phản hồi', accept: 'Tiếp nhận', correct: 'Báo đã xử lý', verify: 'Xác nhận kết quả' };
  private subscriptions = new Subscription();
  private dataRequest?: Subscription;
  private summaryRequest?: Subscription;
  private listRequest?: Subscription;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private dialog?: HTMLDialogElement;

  @ViewChild('formDialog') set formDialog(element: ElementRef<HTMLDialogElement> | undefined) {
    this.dialog = element?.nativeElement;
    if (this.dialog && !this.dialog.open) this.dialog.showModal();
  }

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.paramMap.subscribe((params) => {
      const requested = params.get('section') || 'dashboard';
      const section = OLD_LINKS[requested] || requested;
      if (!SECTIONS.includes(section) || section !== requested) {
        this.go(SECTIONS.includes(section) ? section : 'dashboard',
          requested === 'audit' ? { panel: 'history' } : requested === 'settings' ? { panel: 'settings' } : {}, true); return;
      }
      if (section !== this.section) this.success = '';
      this.section = section; this.search = ''; this.modal = ''; this.selected = null; this.showAllTodos = false;
      this.readQuery(this.route.snapshot.queryParamMap);
      if (this.context) { if (this.allowed(section)) this.load(); else this.go('dashboard', {}, true); }
    }));
    this.subscriptions.add(this.route.queryParamMap.subscribe((query) => this.readQuery(query)));
    if (this.api.token) {
      this.subscriptions.add(this.api.get<{ user: User }>('/auth/me').subscribe({
        next: (result) => this.ready(result.user),
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) { this.api.logout(); this.enterDemo(); }
          else { this.loading = false; this.fail(error); }
        },
      }));
    } else this.enterDemo();
    this.refreshTimer = setInterval(() => {
      if (this.context && !this.modal && !this.loading && !this.saving) this.load(false);
    }, 60000);
  }
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe(); this.dataRequest?.unsubscribe(); this.summaryRequest?.unsubscribe(); this.listRequest?.unsubscribe();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  get canRecord(): boolean { return this.context?.canRecord ?? false; }
  get isReader(): boolean { return this.context?.isNetworkReader ?? false; }
  get canManage(): boolean { return this.context?.canManage ?? false; }
  get isDemo(): boolean { return localStorage.getItem('ksnk_demo') === 'true'; }
  get canReadLog(): boolean { return this.hasRole('KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_SECRETARY'); }
  get canFollowReports(): boolean { return Boolean(this.context?.seesAll) || this.hasRole('DEPARTMENT_HEAD'); }
  get title(): string {
    return ({ dashboard: 'Trang chủ', risks: 'Phiếu', monitorings: 'Phiếu', reports: 'Báo cáo', manage: 'Quản lý' } as Record<string, string>)[this.section];
  }
  get notices(): Notice[] { return this.overview?.notices || []; }
  get visibleTodos(): Todo[] { return this.showAllTodos ? this.todos : this.todos.slice(0, 5); }
  get filteredIssues(): Issue[] {
    if (this.focusId) return this.issues.filter((issue) => issue.id === this.focusId);
    const search = this.search.trim().toLocaleLowerCase('vi');
    return this.issues.filter((issue) => this.matches(issue, this.status) &&
      `${issue.title} ${issue.description} ${issue.subjectName || ''} ${issue.departmentName}`.toLocaleLowerCase('vi').includes(search));
  }
  get filteredMonitorings(): Monitoring[] { return this.monitorings.filter((item) => item.date >= this.from && item.date <= this.to); }
  get reportFromMonth(): string { return this.period === 'month' ? this.reportMonth : this.from.slice(0, 7); }
  get reportToMonth(): string { return this.period === 'month' ? this.reportMonth : this.to.slice(0, 7); }
  get filteredReports(): Report[] {
    return this.reports.filter((report) => (this.canFollowReports || this.isOwnReport(report)) &&
      report.month >= this.reportFromMonth && report.month <= this.reportToMonth);
  }
  get reportTotals(): { monitoringCount: number; risksFound: number; risksClosed: number } {
    return this.filteredReports.reduce((total, report) => ({ monitoringCount: total.monitoringCount + report.monitoringCount,
      risksFound: total.risksFound + report.risksFound, risksClosed: total.risksClosed + report.risksClosed }),
    { monitoringCount: 0, risksFound: 0, risksClosed: 0 });
  }
  get filteredMembers(): Member[] {
    const search = this.search.trim().toLocaleLowerCase('vi');
    return this.members.filter((member) => `${member.fullName} ${member.employeeCode} ${member.departmentName}`.toLocaleLowerCase('vi').includes(search));
  }
  get activeMembers(): number { return this.members.filter((member) => member.active).length; }
  get myReport(): Report | undefined {
    return this.reports.find((report) => report.month === this.reportMonth && this.isOwnReport(report));
  }
  private isOwnReport(report: Report): boolean {
    return report.departmentCode === this.user?.departmentCode &&
      (report.employeeCode ? report.employeeCode === this.user?.employeeCode : report.submittedBy === this.user?.fullName);
  }
  get monitoringAreas(): string[] {
    const area = this.monitoringForm.area;
    return area && !this.areas.includes(area) ? [area, ...this.areas] : this.areas;
  }
  get monitoringRate(): number | null {
    const { sampleSize, compliant } = this.monitoringForm;
    return sampleSize && compliant !== null && compliant <= sampleSize ? Math.round(compliant / sampleSize * 1000) / 10 : null;
  }
  get needsFindings(): boolean {
    const { sampleSize, compliant } = this.monitoringForm;
    return sampleSize !== null && compliant !== null && compliant < sampleSize;
  }
  get reportLate(): boolean { return Boolean(this.overview && this.today > this.overview.work.reportDue); }
  get reportCardAlert(): boolean {
    const work = this.overview?.work;
    if (!work || !this.reportLate) return false;
    return work.ownReportRequired ? !work.ownReportConfirmed : work.reportMissing.length > 0;
  }
  get modalTitle(): string {
    return ({ monitoring: 'Ghi nhận giám sát', issue: 'Ghi nhận vấn đề', respond: 'Phản hồi phiếu',
      correct: 'Báo đã xử lý', verify: 'Xác nhận kết quả', member: 'Thêm thành viên' } as Record<string, string>)[this.modal] || '';
  }

  switchPersona(persona: string): void {
    this.dataRequest?.unsubscribe(); this.listRequest?.unsubscribe(); this.summaryRequest?.unsubscribe();
    this.context = null; this.overview = null; this.issues = []; this.todos = []; this.success = '';
    this.reports = []; this.monitorings = []; this.members = []; this.logs = []; this.reportSummary = null;
    this.showNotices = false; this.focusId = '';
    this.go('dashboard'); this.enterDemo(persona);
  }
  enterDemo(persona = 'doctor'): void {
    this.loading = true; this.error = '';
    this.subscriptions.add(this.api.demoSession(persona).subscribe({
      next: (result) => this.ready(result.user),
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.error = error.status === 403 ? 'Vui lòng mở chức năng KSNK từ ứng dụng MyHV.' : error.error?.message || 'Không mở được KSNK.';
      },
    }));
  }
  private ready(user: User): void {
    this.user = user;
    this.readQuery(this.route.snapshot.queryParamMap);
    this.persona = ({ 'DEMO-NV-001': 'staff', 'DEMO-KSNK-001': 'ksnk' } as Record<string, string>)[user.employeeCode] || 'doctor';
    localStorage.setItem('ksnk_user', JSON.stringify(user));
    this.subscriptions.add(this.api.get<Context>('/module/context').subscribe({
      next: (context) => {
        this.context = context; this.reportDay = context.reportDay;
        if (!this.allowed(this.section)) this.go('dashboard', {}, true);
        else this.load();
        if (this.route.snapshot.queryParamMap.get('create') === 'hand-hygiene' && context.canRecord) this.openMonitoring('Vệ sinh tay');
      },
      error: (error: HttpErrorResponse) => { this.loading = false; this.fail(error); },
    }));
  }
  private allowed(section: string): boolean {
    if (section === 'manage') return this.context?.seesAll ?? false;
    if (['monitorings', 'reports'].includes(section)) return this.isReader;
    return true;
  }
  private hasRole(...roles: string[]): boolean { return this.user?.roles.some((role) => roles.includes(role)) ?? false; }
  private readQuery(query: ParamMap): void {
    const status = query.get('status') || '';
    this.status = FILTERS[status] || status === 'overdue' ? status : '';
    this.focusId = query.get('issue') || '';
    const panel = query.get('panel');
    const manageView = panel === 'settings' || (panel === 'history' && this.canReadLog) ? panel : 'members';
    if (manageView !== this.manageView) {
      this.manageView = manageView;
      if (this.section === 'manage' && this.context) this.loadSectionList();
    }
    const month = query.get('month');
    if (month && month !== this.reportMonth) {
      this.reportMonth = month;
      if (this.section === 'reports' && this.canRecord) this.loadReportSummary();
    }
  }
  go(section: string, queryParams: Record<string, string> = {}, replaceUrl = false): void {
    this.router.navigate(['/app', section], { queryParams, replaceUrl });
  }
  setFilter(status: string): void { this.go('risks', status ? { status } : {}); }

  load(showLoading = true): void {
    this.dataRequest?.unsubscribe();
    if (showLoading) this.loading = true;
    if (showLoading) this.error = '';
    this.today = this.localDate();
    this.dataRequest = forkJoin({
      overview: this.api.get<Overview>(`/module/overview?from=${this.from}&to=${this.to}`),
      issues: this.api.get<{ items: Issue[] }>('/module/issues'),
    }).subscribe({
      next: ({ overview, issues }) => {
        this.overview = overview; this.issues = issues.items; this.loading = false;
        this.stats = this.buildStats(overview.summary);
        this.buildTodos();
      },
      error: (error: HttpErrorResponse) => { this.overview = null; this.loading = false; this.fail(error); },
    });
    this.loadSectionList();
    if (this.section === 'reports' && this.canRecord && showLoading) this.loadReportSummary();
  }
  private loadSectionList(): void {
    this.listRequest?.unsubscribe();
    if (this.section === 'reports' && this.isReader) {
      this.listRequest = this.api.get<{ items: Report[] }>('/reports').subscribe({
        next: (result) => this.reports = result.items,
        error: (error: HttpErrorResponse) => this.fail(error),
      });
    }
    if (this.section === 'monitorings' && this.isReader) {
      this.listRequest = this.api.get<{ items: Monitoring[] }>('/monitorings').subscribe({
        next: (result) => this.monitorings = result.items, error: (error: HttpErrorResponse) => this.fail(error),
      });
    }
    if (this.section === 'manage' && this.context?.seesAll && this.manageView === 'members') {
      this.listRequest = this.api.get<{ items: Member[] }>('/members').subscribe({
        next: (result) => this.members = result.items, error: (error: HttpErrorResponse) => this.fail(error),
      });
    }
    if (this.section === 'manage' && this.manageView === 'history' && this.canReadLog) {
      this.listRequest = this.api.get<{ items: LogEntry[] }>('/audit').subscribe({
        next: (result) => this.logs = result.items.slice(0, 30), error: (error: HttpErrorResponse) => this.fail(error),
      });
    }
  }
  setPeriod(period: string): void {
    this.period = period;
    if (period === 'custom') return;
    this.today = this.localDate();
    const year = this.today.slice(0, 4);
    const month = Number(this.today.slice(5, 7));
    const start = { month, quarter: Math.floor((month - 1) / 3) * 3 + 1, half: month > 6 ? 7 : 1, year: 1 }[period] || month;
    this.from = `${year}-${String(start).padStart(2, '0')}-01`;
    this.to = this.today;
    this.load();
  }
  applyRange(): void {
    if (!this.from || !this.to || this.from > this.to) { this.error = 'Ngày bắt đầu phải trước ngày kết thúc.'; return; }
    this.load();
  }
  loadReportSummary(): void {
    this.summaryRequest?.unsubscribe(); this.reportSummary = null; this.summaryLoading = false;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.reportMonth) || this.reportMonth > this.today.slice(0, 7)) {
      this.error = 'Chọn tháng hiện tại hoặc trước đó.'; return;
    }
    this.summaryLoading = true; this.error = '';
    this.summaryRequest = this.api.get<{ summary: Summary }>(`/module/report-summary?month=${this.reportMonth}`).subscribe({
      next: (result) => { this.reportSummary = result.summary; this.summaryLoading = false; },
      error: (error: HttpErrorResponse) => { this.summaryLoading = false; this.fail(error); },
    });
  }

  private buildStats(summary: Summary): StatRow[] {
    const names = [...new Set([...summary.compliance.map((row) => row.name), ...summary.categories.map((row) => row.name)])];
    return names.map((name) => {
      const check = summary.compliance.find((row) => row.name === name);
      const issue = summary.categories.find((row) => row.name === name);
      return { name, checked: check?.total ?? 0, met: check?.met ?? 0, rate: check?.rate ?? null,
        issues: issue?.total ?? 0, share: issue?.share ?? null, closed: issue?.closed ?? 0, closedRate: issue?.rate ?? null };
    });
  }
  private buildTodos(): void {
    const data = this.overview;
    if (!data) { this.todos = []; return; }
    const todos: Todo[] = [];
    const month = this.monthLabel(data.work.reportMonth);
    if (this.canFollowReports && !data.work.ownReportRequired && data.work.reportMissing.length && this.reportLate) {
      todos.push({ key: 'missing', text: `${data.work.reportMissing.length} người chưa xác nhận báo cáo tháng ${month}`,
        note: 'Đã quá hạn', urgent: true, button: 'Xem', run: () => this.openReport(data.work.reportMonth) });
    }
    if (this.canRecord && data.work.ownReportRequired && !data.work.ownReportConfirmed) {
      todos.push({ key: 'own-report', text: `Xác nhận báo cáo tháng ${month} của bạn`, note: `Hạn ${this.date(data.work.reportDue)}`,
        urgent: this.reportLate, button: 'Xác nhận', run: () => this.openReport(data.work.reportMonth) });
    }
    if (this.canRecord) for (const task of data.tasks) {
      todos.push({ key: task.id, text: task.title, note: task.dueDate ? `Đến hạn ${this.date(task.dueDate)}` : '', urgent: false,
        button: 'Ghi nhận', run: () => this.openMonitoring(task.area) });
    }
    for (const issue of this.issues) {
      const step = this.nextStep(issue);
      if (!step) continue;
      todos.push({ key: issue.id, text: issue.title,
        note: this.overdue(issue) ? `Quá hạn ${this.date(issue.dueDate)}` :
          issue.severity === 'Cao' ? 'Nguy hiểm · Cần báo trực tiếp ngay' : this.statusLabel(issue.status),
        urgent: this.overdue(issue) || issue.severity === 'Cao', button: this.stepLabel[step], run: () => this.doStep(issue, step) });
    }
    this.todos = [...todos.filter((todo) => todo.urgent), ...todos.filter((todo) => !todo.urgent)];
  }

  nextStep(issue: Issue): Step | null {
    if (issue.canRespond && !issue.responses?.length) return 'respond';
    if (issue.status === 'Mới ghi nhận' && this.hasRole('DEPARTMENT_HEAD', 'KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY')) return 'accept';
    if (FILTERS['processing'](issue) && this.hasRole('DEPARTMENT_HEAD', 'MEMBER_DOCTOR', 'MEMBER_NURSE')) return 'correct';
    if (issue.status === 'Chờ kiểm tra lại' && this.hasRole('KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY')) return 'verify';
    return null;
  }
  doStep(issue: Issue, step: Step): void {
    this.selected = issue;
    if (step === 'accept') { this.submit(`/risks/${issue.id}`, { action: 'accept' }, 'Đã tiếp nhận.', true); return; }
    if (step === 'respond') this.response = { explanation: '', evidence: '' };
    else this.action = { correction: '', evidence: '', verification: '', passed: true };
    this.open(step);
  }
  matches(issue: Issue, status: string): boolean {
    if (!status) return true;
    return status === 'overdue' ? this.overdue(issue) : FILTERS[status]?.(issue) ?? true;
  }
  count(status: string): number { return this.issues.filter((issue) => this.matches(issue, status)).length; }

  private newMonitoring() {
    return { date: this.localDate(), area: '', sampleSize: null as number | null, compliant: null as number | null, findings: '' };
  }
  private newIssue() {
    return { category: '', severity: '', description: '', subjectEmployeeCode: '', immediateAction: '', dueDate: '' };
  }
  private newMember() { return { fullName: '', employeeCode: '', departmentCode: '', memberType: '' }; }
  openMonitoring(area = ''): void { this.monitoringForm = this.newMonitoring(); this.monitoringForm.area = area; this.open('monitoring'); }
  openIssue(): void { this.issueForm = this.newIssue(); this.open('issue'); }
  openMember(): void {
    this.memberForm = this.newMember(); this.open('member');
    if (!this.departments.length) this.subscriptions.add(this.api.get<{ items: Department[] }>('/departments').subscribe({
      next: (result) => this.departments = result.items, error: (error: HttpErrorResponse) => this.fail(error),
    }));
  }
  open(modal: string): void { this.modal = modal; this.error = ''; this.success = ''; }
  close(): void { if (!this.saving) { this.dialog?.close(); this.modal = ''; this.error = ''; } }
  cancelDialog(event: Event): void { event.preventDefault(); this.close(); }
  openReport(month: string): void { this.go('reports', { month }); }

  saveMonitoring(): void { this.submit('/monitorings', this.monitoringForm, 'Đã lưu giám sát.'); }
  saveIssue(): void { this.submit('/risks', this.issueForm, 'Đã gửi vấn đề.'); }
  sendResponse(): void {
    if (this.selected) this.submit(`/module/issues/${this.selected.id}/responses`, this.response, 'Đã gửi phản hồi.');
  }
  saveAction(): void {
    if (!this.selected) return;
    this.submit(`/risks/${this.selected.id}`, this.modal === 'verify' ?
      { action: 'verify', verification: this.action.verification.trim() || (this.action.passed ? 'Đạt' : ''), passed: this.action.passed } :
      { action: 'correct', correction: this.action.correction, evidence: this.action.evidence },
    'Đã cập nhật.', true);
  }
  confirmReport(): void {
    this.submit('/reports', { month: this.reportMonth, recommendations: this.recommendation }, 'Đã xác nhận báo cáo.');
  }
  saveMember(): void {
    const department = this.departments.find((item) => item.makhoa === this.memberForm.departmentCode);
    if (!department) { this.error = 'Chọn khoa.'; return; }
    this.submit('/members', { ...this.memberForm, departmentName: department.tenkhoa }, 'Đã thêm thành viên.');
  }
  toggleMember(member: Member): void {
    if (member.active && !confirm(`Ngừng ${member.fullName} trong mạng lưới? Người này sẽ không lập phiếu được nữa.`)) return;
    this.submit(`/module/members/${member.id}`, { active: !member.active }, member.active ? 'Đã ngừng thành viên.' : 'Đã mở lại thành viên.', true);
  }
  saveReportDay(): void {
    this.saving = true; this.error = ''; this.success = '';
    this.subscriptions.add(this.api.put<{ reportDay: number }>('/module/settings', { reportDay: Number(this.reportDay) }).subscribe({
      next: (result) => { this.saving = false; this.reportDay = result.reportDay; if (this.context) this.context.reportDay = result.reportDay; this.success = 'Đã lưu hạn báo cáo.'; this.load(false); },
      error: (error: HttpErrorResponse) => { this.saving = false; this.fail(error); },
    }));
  }
  private submit(path: string, body: unknown, message: string, patch = false): void {
    if (this.saving) return;
    this.saving = true; this.error = ''; this.success = '';
    this.subscriptions.add((patch ? this.api.patch(path, body) : this.api.post(path, body)).subscribe({
      next: () => {
        this.saving = false; this.close(); this.success = message; this.load();
        if (path === '/reports') this.recommendation = '';
      },
      error: (error: HttpErrorResponse) => { this.saving = false; this.fail(error); },
    }));
  }
  openNotice(notice: Notice): void {
    this.showNotices = false;
    if (notice.reportMonth) this.openReport(notice.reportMonth);
    else if (notice.riskId) this.go('risks', { issue: notice.riskId });
    // Opening an issue clears every unread personal notice about that issue.
    const unread = this.notices.filter((item) => item.recipient && (item.id === notice.id || (notice.riskId && item.riskId === notice.riskId)));
    for (const item of unread) this.subscriptions.add(this.api.patch(`/module/notifications/${item.id}/read`, {}).subscribe({
      next: () => this.load(false), error: (error: HttpErrorResponse) => this.fail(error),
    }));
  }

  statusLabel(status: string): string { return STATUS[status] || status; }
  levelLabel(severity: string): string { return this.levels.find((level) => level.value === severity)?.badge || severity; }
  waitingFor(issue: Issue): string {
    if (issue.status === 'Mới ghi nhận') return 'Chờ lãnh đạo khoa hoặc Khoa KSNK tiếp nhận.';
    if (issue.status === 'Chờ kiểm tra lại') return 'Khoa đã báo xử lý xong. Chờ Khoa KSNK xác nhận.';
    if (issue.status === 'Đã đóng') return 'Khoa KSNK đã xác nhận hoàn thành.';
    return `Khoa đang xử lý. Phụ trách: ${issue.assignedTo || 'chưa phân công'}.`;
  }
  isSubject(issue: Issue): boolean { return Boolean(this.user?.employeeCode) && issue.subjectEmployeeCode === this.user?.employeeCode; }
  overdue(issue: Issue): boolean {
    return !['Đã đóng', 'Chờ kiểm tra lại'].includes(issue.status) && Boolean(issue.dueDate) && issue.dueDate < this.localDate();
  }
  rate(value: number | null): string { return value === null ? '—' : `${value}%`; }
  monthLabel(month: string): string { return month ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : ''; }
  date(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value));
  }
  dateTime(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }
  localDate(): string { return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); }
  private previousMonth(): string {
    const date = new Date(`${this.localDate().slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  }
  exportReport(): void {
    if (!this.overview) return;
    const summary = this.overview.summary;
    const rows: (string | number)[][] = this.section === 'reports' ?
      [['Từ tháng', this.reportFromMonth, 'Đến tháng', this.reportToMonth], [],
        ['Tháng', 'Người báo cáo', 'Khoa', 'Giám sát', 'Vấn đề', 'Đã xử lý xong'],
        ...this.filteredReports.map((report) => [report.month, report.submittedBy, report.departmentName,
          report.monitoringCount, report.risksFound, report.risksClosed]),
        ['Tổng', '', '', this.reportTotals.monitoringCount, this.reportTotals.risksFound, this.reportTotals.risksClosed]] :
      [['Từ ngày', this.from, 'Đến ngày', this.to], [],
      ['Nội dung', 'Lượt làm đúng', 'Lượt kiểm tra', 'Tỷ lệ làm đúng (%)', 'Số vấn đề', 'Tỷ lệ trên tổng vấn đề (%)', 'Đã xử lý xong', 'Tỷ lệ xử lý xong (%)'],
      ...this.stats.map((row) => [row.name, row.met, row.checked, row.rate ?? '', row.issues, row.share ?? '', row.closed, row.closedRate ?? '']),
      ['Tổng', '', '', '', summary.risksFound, summary.risksFound ? 100 : '', summary.risksClosed, summary.closureRate ?? '']];
    const csv = '\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = this.section === 'reports' ? `ksnk-${this.reportFromMonth}-${this.reportToMonth}.csv` : `ksnk-${this.from}-${this.to}.csv`;
    link.click(); URL.revokeObjectURL(url);
  }
  private fail(error: HttpErrorResponse): void { this.error = error.error?.message || 'Không tải được dữ liệu. Vui lòng thử lại.'; }
}
