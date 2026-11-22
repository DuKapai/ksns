import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin, of } from 'rxjs';
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
  compliance: { name: string; total: number; met: number; notPerformed: number; rate: number | null }[];
  departmentCompliance: { departmentCode: string; departmentName: string; area: string; total: number; met: number;
    notPerformed: number; rate: number | null }[];
  roleCompliance: { role: string; area: string; total: number; met: number; notPerformed: number; rate: number | null }[];
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
interface CaseReport {
  id: string; type: 'hospital-infection' | 'transmission-disease'; date: string; doctor: string;
  employeeCode: string; departmentName: string; patientName: string; patientBirthYear: number | null;
  patientGender: string; patientAddress: string; admissionDate: string; diagnosisCode: string;
  diagnosisName: string; infectionType: string; onsetDate: string; isolationStartDate: string;
  isolationEndDate: string; preventiveMeasures: string; interventionNeeded: string;
  interventionDetails: string; caseClassification: string; outcome: string; labResult: string;
  caseNote: string; createdAt: string;
}
interface CaseReportSummary {
  total: number; hospitalInfections: number; transmissionDiseases: number;
  interventionStats: { value: string; count: number; rate: number | null }[];
  infectionTypes: { type: string; count: number; rate: number | null }[];
  transmissionByDisease: { disease: string; total: number; suspected: number; confirmed: number; admitted: number;
    discharged: number; transferred: number; deceased: number; rate: number | null;
    suspectedRate: number | null; confirmedRate: number | null; admittedRate: number | null;
    dischargedRate: number | null; transferredRate: number | null; deceasedRate: number | null }[];
}
interface InfectionReport {
  type: 'hospital-infection';
  date: string; patientName: string; patientBirthYear: number | null; patientGender: string;
  patientAddress: string; admissionDate: string; diagnosisCode: string; diagnosisName: string;
  infectionType: '' | 'urinary' | 'respiratory' | 'bloodstream' | 'surgical-wound';
  onsetDate: string; interventionNeeded: string; interventionDetails: string;
}
interface TransmissionReport {
  type: 'transmission-disease';
  date: string; patientName: string; patientBirthYear: number | null; patientGender: string;
  patientAddress: string; admissionDate: string; diagnosisName: string; onsetDate: string;
  isolationStartDate: string; isolationEndDate: string; preventiveMeasures: string;
  interventionNeeded: string; interventionDetails: string; caseClassification: string;
  outcome: string; labResult: string; caseNote: string;
}
interface Monitoring { id: string; date: string; area: string; observer: string; sampleSize: number; compliant: number;
  notPerformed?: number; findings: string; }
interface Report {
  id: string; month: string; departmentCode: string; departmentName: string; submittedBy: string; createdAt: string; employeeCode?: string;
  monitoringCount: number; risksFound: number; risksClosed: number; source?: string; memberType?: string;
  summary?: Pick<Summary, 'categories' | 'compliance' | 'departmentCompliance' | 'roleCompliance'>;
}
interface ReportReadinessGroup { required: number; submitted: number; rate: number | null; complete: boolean; }
interface ReportReadiness {
  from: string; to: string; required: number; submitted: number; rate: number | null; complete: boolean;
  doctors: ReportReadinessGroup; members: ReportReadinessGroup;
  missing: { month: string; fullName: string; departmentName: string; memberType: string }[];
}
interface WeeklyReport {
  id: string; from: string; to: string; activities: string; difficulties: string; nextWeekPlan: string; recommendations: string;
  employeeCode: string; submittedBy: string; memberType: string; departmentCode: string; departmentName: string;
  createdAt: string; status: string;
}
interface WeeklyReadiness {
  required: number; submitted: number; rate: number | null; complete: boolean;
  doctors: ReportReadinessGroup; members: ReportReadinessGroup;
  missing: { fullName: string; departmentName: string; memberType: string }[];
}
interface WeeklyReportResponse {
  from: string; to: string; items: WeeklyReport[];
  summaries: { all: Summary; doctors: Summary; members: Summary };
  readiness: WeeklyReadiness | null;
}
interface Member { id: string; employeeCode: string; fullName: string; departmentName: string; memberType: string; active: boolean; }
interface Department { makhoa: string; tenkhoa: string; }
interface LogEntry { id: string; at: string; user: string; action: string; }
interface Todo { key: string; text: string; note: string; urgent: boolean; button: string; run: () => void; }
interface StatRow {
  name: string; checked: number; met: number; notPerformed: number; rate: number | null;
  issues: number; share: number | null; closed: number; closedRate: number | null;
}
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
  weekFrom = this.previousWeekRange().from;
  weekTo = this.previousWeekRange().to;
  weeklyForm = this.newWeeklyReport();
  reportMonth = this.previousMonth();
  reportSummary: Summary | null = null;
  summaryLoading = false;
  recommendation = '';
  issues: Issue[] = [];
  monitorings: Monitoring[] = [];
  reports: Report[] = [];
  reportReadiness: ReportReadiness | null = null;
  weeklyReports: WeeklyReport[] = [];
  weeklyReportReadiness: WeeklyReadiness | null = null;
  weeklySummaries: WeeklyReportResponse['summaries'] | null = null;
  weeklyCaseReports: CaseReport[] = [];
  weeklyCaseReportSummary: CaseReportSummary | null = null;
  weeklyReportGroup = 'all';
  caseReports: CaseReport[] = [];
  caseReportSummary: CaseReportSummary | null = null;
  reportGroup = 'all';
  reportView: 'weekly' | 'monthly' = 'weekly';
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
  private weeklyFormPeriod = '';
  manageView = 'members';
  reportDay = 5;
  response = { explanation: '', evidence: '' };
  action = { correction: '', evidence: '', verification: '', passed: true };
  monitoringForm = this.newMonitoring();
  issueForm = this.newIssue();
  memberForm = this.newMember();
  infectionForm = this.newInfectionReport();
  transmissionForm = this.newTransmissionReport();
  readonly areas = ['Vệ sinh tay', 'Phương tiện phòng hộ cá nhân', 'Phòng ngừa chuẩn/cách ly', 'Thiết bị xâm lấn',
    'Sử dụng phòng hộ cá nhân', 'Phân loại chất thải', 'Vệ sinh môi trường/khử khuẩn bề mặt',
    'Khử khuẩn/tiệt khuẩn dụng cụ', 'Chất thải y tế', 'Tiêm an toàn', 'Phơi nhiễm/vật sắc nhọn', 'Khác'];
  readonly nurseAreas = ['Vệ sinh tay', 'Sử dụng phòng hộ cá nhân', 'Phân loại chất thải'];
  readonly observedRoles = ['Bác sỹ', 'Điều dưỡng', 'KTV', 'Nữ hộ sinh', 'Hộ lý'];
  readonly levels = [
    { value: 'Thấp', label: 'Nhẹ', badge: 'Mức nhẹ', hint: 'Nhắc tại chỗ, theo dõi thêm' },
    { value: 'Trung bình', label: 'Trung bình', badge: 'Mức trung bình', hint: 'Khoa cần khắc phục trong hạn' },
    { value: 'Cao', label: 'Nguy hiểm', badge: 'Nguy hiểm', hint: 'Báo ngay lãnh đạo khoa và Khoa KSNK' },
  ];
  readonly periods = [{ value: 'month', label: 'Tháng này' }, { value: 'q1', label: 'Quý 1' },
    { value: 'q2', label: 'Quý 2' }, { value: 'q3', label: 'Quý 3' }, { value: 'q4', label: 'Quý 4' },
    { value: 'half', label: '6 tháng' }, { value: 'year', label: 'Năm nay' }, { value: 'custom', label: 'Chọn ngày' }];
  readonly filters = [{ value: '', label: 'Tất cả' }, { value: 'new', label: 'Chờ tiếp nhận' }, { value: 'processing', label: 'Đang xử lý' },
    { value: 'waiting', label: 'Chờ xác nhận' }, { value: 'overdue', label: 'Quá hạn' }, { value: 'done', label: 'Hoàn thành' }];
  readonly memberTypes = ['Bác sĩ', 'Điều dưỡng', 'Hộ sinh', 'Kỹ thuật y', 'Lãnh đạo đơn vị', 'KSNK'];
  readonly personas = [
    { value: 'member', label: 'Thành viên mạng lưới' },
    { value: 'doctor', label: 'Bác sĩ' },
    { value: 'ksnk', label: 'Khoa KSNK' },
  ];
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
  get demoRoleLabel(): string {
    return this.hasRole('MEMBER_DOCTOR') ? 'Bác sĩ' : this.hasRole('MEMBER_NURSE') ? 'Điều dưỡng' : 'Khoa KSNK';
  }
  get canCreateCaseReport(): boolean { return this.canRecord && this.hasRole('MEMBER_DOCTOR'); }
  get canReadCaseReports(): boolean { return this.canCreateCaseReport || this.canFollowReports; }
  get canSubmitWeeklyReport(): boolean {
    return this.canRecord && this.hasRole('MEMBER_DOCTOR', 'MEMBER_NURSE', 'NETWORK_MEMBER', 'DEPARTMENT_HEAD');
  }
  get isNurse(): boolean { return this.hasRole('MEMBER_NURSE'); }
  get isDemo(): boolean { return localStorage.getItem('ksnk_demo') === 'true'; }
  get canReadLog(): boolean { return this.hasRole('KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_SECRETARY'); }
  get canFollowReports(): boolean { return Boolean(this.context?.seesAll) || this.hasRole('DEPARTMENT_HEAD'); }
  get weeklyRangeValid(): boolean {
    if (!this.weekFrom || !this.weekTo || this.weekTo > this.today) return false;
    return Date.parse(`${this.weekTo}T00:00:00Z`) - Date.parse(`${this.weekFrom}T00:00:00Z`) === 6 * 86400000;
  }
  get myWeeklyReport(): WeeklyReport | undefined {
    return this.weeklyReports.find((report) => report.employeeCode === this.user?.employeeCode);
  }
  get filteredWeeklyReports(): WeeklyReport[] {
    return this.weeklyReports.filter((report) => this.weeklyReportGroup === 'all' ||
      (this.weeklyReportGroup === 'doctors' ? report.memberType === 'Bác sĩ' : report.memberType !== 'Bác sĩ'));
  }
  get selectedWeeklySummary(): Summary | null {
    if (this.weeklyReportGroup === 'all' && this.canFollowReports && !this.weeklyReportReadiness?.complete) return null;
    return this.weeklySummaries?.[this.weeklyReportGroup as 'all' | 'doctors' | 'members'] || null;
  }
  get title(): string {
    if (this.section === 'dashboard') {
      return this.persona === 'doctor' ? 'Công việc bác sĩ' :
        this.persona === 'member' ? 'Công việc thành viên mạng lưới' : 'Trang chủ';
    }
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
  get caseReportFromDate(): string { return this.period === 'month' ? `${this.reportMonth}-01` : this.from; }
  get caseReportToDate(): string {
    if (this.period !== 'month') return this.to;
    const [year, month] = this.reportMonth.split('-').map(Number);
    return `${this.reportMonth}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  }
  get filteredReports(): Report[] {
    return this.reports.filter((report) => (this.canFollowReports || this.isOwnReport(report)) &&
      (this.reportGroup === 'all' ||
        (this.reportGroup === 'doctors' ? report.memberType === 'Bác sĩ' || report.source === 'doctor'
          : ['Điều dưỡng', 'Hộ sinh', 'Kỹ thuật y', 'Lãnh đạo đơn vị'].includes(report.memberType || '') && report.source !== 'doctor')) &&
      report.month >= this.reportFromMonth && report.month <= this.reportToMonth);
  }
  get reportTotals(): { monitoringCount: number; risksFound: number; risksClosed: number } {
    return this.filteredReports.reduce((total, report) => ({ monitoringCount: total.monitoringCount + report.monitoringCount,
      risksFound: total.risksFound + report.risksFound, risksClosed: total.risksClosed + report.risksClosed }),
    { monitoringCount: 0, risksFound: 0, risksClosed: 0 });
  }
  get reportClosureRate(): number | null {
    return this.reportTotals.risksFound
      ? Math.round(this.reportTotals.risksClosed / this.reportTotals.risksFound * 1000) / 10
      : null;
  }
  get reportSubmissionRate(): number | null {
    const work = this.overview?.work;
    return work?.reportRequired
      ? Math.round(work.reportConfirmed / work.reportRequired * 1000) / 10
      : null;
  }
  get reportTopicSummary(): { name: string; total: number; met: number; notPerformed: number; rate: number | null;
    issues: number; share: number | null; closed: number; closedRate: number | null }[] {
    const totals = new Map<string, { total: number; met: number; notPerformed: number; issues: number; closed: number }>();
    for (const report of this.filteredReports) {
      for (const row of report.summary?.compliance || []) {
        const total = totals.get(row.name) || { total: 0, met: 0, notPerformed: 0, issues: 0, closed: 0 };
        total.total += row.total; total.met += row.met; total.notPerformed += row.notPerformed || 0; totals.set(row.name, total);
      }
      for (const row of report.summary?.categories || []) {
        const total = totals.get(row.name) || { total: 0, met: 0, notPerformed: 0, issues: 0, closed: 0 };
        total.issues += row.total; total.closed += row.closed; totals.set(row.name, total);
      }
    }
    return [...totals].map(([name, row]) => ({
      name, ...row,
      rate: row.total ? Math.round(row.met / row.total * 1000) / 10 : null,
      share: this.reportTotals.risksFound ? Math.round(row.issues / this.reportTotals.risksFound * 1000) / 10 : null,
      closedRate: row.issues ? Math.round(row.closed / row.issues * 1000) / 10 : null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }
  get reportDepartmentSummary(): Summary['departmentCompliance'] {
    const totals = new Map<string, Summary['departmentCompliance'][number]>();
    for (const report of this.filteredReports) {
      for (const row of report.summary?.departmentCompliance || []) {
        const key = `${row.departmentCode}\u0000${row.area}`;
        const total = totals.get(key) || { ...row, total: 0, met: 0, notPerformed: 0, rate: null };
        total.total += row.total; total.met += row.met; total.notPerformed += row.notPerformed || 0;
        total.rate = total.total ? Math.round(total.met / total.total * 1000) / 10 : null;
        totals.set(key, total);
      }
    }
    return [...totals.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi') ||
      a.area.localeCompare(b.area, 'vi'));
  }
  get reportRoleSummary(): Summary['roleCompliance'] {
    const totals = new Map<string, Summary['roleCompliance'][number]>();
    for (const report of this.filteredReports) {
      for (const row of report.summary?.roleCompliance || []) {
        const key = `${row.role}\u0000${row.area}`;
        const total = totals.get(key) || { ...row, total: 0, met: 0, notPerformed: 0, rate: null };
        total.total += row.total; total.met += row.met; total.notPerformed += row.notPerformed || 0;
        total.rate = total.total ? Math.round(total.met / total.total * 1000) / 10 : null;
        totals.set(key, total);
      }
    }
    return [...totals.values()].sort((a, b) => a.role.localeCompare(b.role, 'vi') || a.area.localeCompare(b.area, 'vi'));
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
    const available = this.isNurse ? this.nurseAreas : this.areas;
    return area && !available.includes(area) ? [area, ...available] : available;
  }
  monitoringAreaChanged(area: string): void {
    if (area !== 'Vệ sinh tay' && this.monitoringForm.practiceResult === 'Không VST') {
      this.monitoringForm.practiceResult = '';
      this.monitoringForm.sampleSize = null;
      this.monitoringForm.compliant = null;
    }
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
      correct: 'Báo đã xử lý', verify: 'Xác nhận kết quả', member: 'Thêm thành viên',
      'infection-report': 'Báo cáo nhiễm khuẩn bệnh viện', 'transmission-report': 'Báo cáo bệnh truyền nhiễm',
    } as Record<string, string>)[this.modal] || '';
  }

  switchPersona(persona: string): void {
    this.dataRequest?.unsubscribe(); this.listRequest?.unsubscribe(); this.summaryRequest?.unsubscribe();
    this.context = null; this.overview = null; this.issues = []; this.todos = []; this.success = '';
    this.reports = []; this.reportReadiness = null; this.weeklyReports = []; this.weeklyReportReadiness = null;
    this.weeklySummaries = null; this.weeklyCaseReports = []; this.weeklyCaseReportSummary = null;
    this.weeklyFormPeriod = ''; this.caseReports = []; this.caseReportSummary = null;
    this.monitorings = []; this.members = []; this.logs = []; this.reportSummary = null;
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
    this.weeklyReportGroup = user.roles.includes('MEMBER_DOCTOR') ? 'doctors' :
      user.roles.includes('MEMBER_NURSE') || user.roles.includes('NETWORK_MEMBER') ||
      user.roles.includes('DEPARTMENT_HEAD') ? 'members' : 'all';
    this.readQuery(this.route.snapshot.queryParamMap);
    this.persona = user.roles.includes('MEMBER_DOCTOR') ? 'doctor' :
      user.roles.some((role) => ['KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY', 'NETWORK_SECRETARY'].includes(role))
        ? 'ksnk' : 'member';
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
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= this.today.slice(0, 7) && month !== this.reportMonth) {
      this.reportMonth = month;
      if (this.section === 'reports') {
        this.loadSectionList();
        if (this.canRecord) this.loadReportSummary();
      }
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
      this.reportReadiness = null;
      this.weeklyReportReadiness = null;
      this.listRequest = forkJoin({
        reports: this.api.get<{ items: Report[] }>('/reports'),
        cases: this.canReadCaseReports
          ? this.api.get<{ items: CaseReport[]; summary: CaseReportSummary }>(
            `/module/case-reports?from=${this.caseReportFromDate}&to=${this.caseReportToDate}`)
          : of({ items: [], summary: null }),
        weekly: this.api.get<WeeklyReportResponse>(`/module/weekly-reports?from=${this.weekFrom}&to=${this.weekTo}`),
        weeklyCases: this.canReadCaseReports
          ? this.api.get<{ items: CaseReport[]; summary: CaseReportSummary }>(
            `/module/case-reports?from=${this.weekFrom}&to=${this.weekTo}`)
          : of({ items: [], summary: null }),
        readiness: this.canFollowReports
          ? this.api.get<ReportReadiness>(`/module/report-readiness?from=${this.reportFromMonth}&to=${this.reportToMonth}`)
          : of(null),
      }).subscribe({
        next: ({ reports, cases, weekly, weeklyCases, readiness }) => {
          this.reports = reports.items;
          this.reportReadiness = readiness;
          this.caseReports = cases.items;
          this.caseReportSummary = cases.summary;
          this.weeklyReports = weekly.items;
          this.weeklyReportReadiness = weekly.readiness;
          this.weeklySummaries = weekly.summaries;
          this.weeklyCaseReports = weeklyCases.items;
          this.weeklyCaseReportSummary = weeklyCases.summary;
          const weekKey = `${this.weekFrom}|${this.weekTo}`;
          if (this.weeklyFormPeriod !== weekKey) {
            const ownReport = weekly.items.find((report) => report.employeeCode === this.user?.employeeCode);
            this.weeklyForm = ownReport ? {
              activities: ownReport.activities, difficulties: ownReport.difficulties,
              nextWeekPlan: ownReport.nextWeekPlan, recommendations: ownReport.recommendations,
            } : this.newWeeklyReport();
            this.weeklyFormPeriod = weekKey;
          }
        },
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
    const quarterStart: Record<string, number> = { q1: 1, q2: 4, q3: 7, q4: 10 };
    const start = period in quarterStart ? quarterStart[period] :
      period === 'half' ? (month > 6 ? 7 : 1) : period === 'year' ? 1 : month;
    this.from = `${year}-${String(start).padStart(2, '0')}-01`;
    const endMonth = period in quarterStart ? start + 2 :
      period === 'half' ? start + 5 : period === 'year' ? 12 : month;
    const lastDay = new Date(Date.UTC(Number(year), endMonth, 0)).getUTCDate();
    const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    this.to = end > this.today ? this.today : end;
    this.load();
  }
  periodLabel(value: string, label: string): string {
    return /^q[1-4]$/.test(value) ? `${label} (${this.today.slice(0, 4)})` : label;
  }
  applyRange(): void {
    if (!this.from || !this.to || this.from > this.to) { this.error = 'Ngày bắt đầu phải trước ngày kết thúc.'; return; }
    this.load();
  }
  weeklyRangeChanged(): void {
    if (!this.weeklyRangeValid) { this.error = 'Báo cáo tuần phải gồm đúng 7 ngày và không vượt quá hôm nay.'; return; }
    this.error = '';
    this.weeklyFormPeriod = '';
    this.loadSectionList();
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
  reportMonthChanged(): void {
    this.loadReportSummary();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(this.reportMonth) && this.reportMonth <= this.today.slice(0, 7)) {
      this.loadSectionList();
    }
  }

  private buildStats(summary: Summary): StatRow[] {
    const names = [...new Set([...summary.compliance.map((row) => row.name), ...summary.categories.map((row) => row.name)])];
    return names.map((name) => {
      const check = summary.compliance.find((row) => row.name === name);
      const issue = summary.categories.find((row) => row.name === name);
      return { name, checked: check?.total ?? 0, met: check?.met ?? 0, notPerformed: check?.notPerformed ?? 0,
        rate: check?.rate ?? null,
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
    return { date: this.localDate(), area: '', sampleSize: null as number | null, compliant: null as number | null,
      findings: '', method: 'Quan sát trực tiếp', observedRole: '', observedPerson: '', observationMoment: '',
      practiceResult: '', procedure: '', wasteType: '' };
  }
  setPracticeResult(result: string): void {
    this.monitoringForm.practiceResult = result;
    this.monitoringForm.sampleSize = 1;
    this.monitoringForm.compliant = result === 'Đạt' ? 1 : 0;
  }
  private newIssue() {
    return { category: '', severity: '', description: '', subjectEmployeeCode: '', immediateAction: '', dueDate: '' };
  }
  private newMember() { return { fullName: '', employeeCode: '', departmentCode: '', memberType: '' }; }
  private newWeeklyReport() {
    return { activities: '', difficulties: '', nextWeekPlan: '', recommendations: '' };
  }
  private newInfectionReport() {
    return {
      type: 'hospital-infection', date: this.localDate(), patientName: '', patientBirthYear: null, patientGender: '',
      patientAddress: '', admissionDate: '', diagnosisCode: '', diagnosisName: '',
      infectionType: '', onsetDate: '', interventionNeeded: '', interventionDetails: '', status: 'pending'
    } as Partial<InfectionReport>;
  }
  private newTransmissionReport() {
    return {
      type: 'transmission-disease', date: this.localDate(), patientName: '', patientBirthYear: null, patientGender: '',
      patientAddress: '', admissionDate: '', diagnosisName: '',
      onsetDate: '', isolationStartDate: '', isolationEndDate: '', preventiveMeasures: '',
      interventionNeeded: '', interventionDetails: '', caseClassification: '', outcome: '', labResult: '', caseNote: ''
    } as Partial<TransmissionReport>;
  }
  openMonitoring(area = ''): void { this.monitoringForm = this.newMonitoring(); this.monitoringForm.area = area; this.open('monitoring'); }
  openIssue(): void { this.issueForm = this.newIssue(); this.open('issue'); }
  openMember(): void {
    this.memberForm = this.newMember(); this.open('member');
    if (!this.departments.length) this.subscriptions.add(this.api.get<{ items: Department[] }>('/departments').subscribe({
      next: (result) => this.departments = result.items, error: (error: HttpErrorResponse) => this.fail(error),
    }));
  }
  openInfectionReport(): void { this.infectionForm = this.newInfectionReport(); this.open('infection-report'); }
  openTransmissionReport(): void { this.transmissionForm = this.newTransmissionReport(); this.open('transmission-report'); }
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
  saveWeeklyReport(): void {
    if (!this.weeklyRangeValid) { this.error = 'Báo cáo tuần phải gồm đúng 7 ngày và không vượt quá hôm nay.'; return; }
    this.submit('/module/weekly-reports', { from: this.weekFrom, to: this.weekTo, ...this.weeklyForm }, 'Đã lưu báo cáo tuần.');
  }
  saveMember(): void {
    const department = this.departments.find((item) => item.makhoa === this.memberForm.departmentCode);
    if (!department) { this.error = 'Chọn khoa.'; return; }
    this.submit('/members', { ...this.memberForm, departmentName: department.tenkhoa }, 'Đã thêm thành viên.');
  }
  saveInfectionReport(): void {
    if (!this.user) return;
    const report: Partial<InfectionReport> = {
      type: 'hospital-infection',
      date: this.infectionForm.date || this.localDate(),
      infectionType: (this.infectionForm.infectionType as 'urinary' | 'respiratory' | 'bloodstream' | 'surgical-wound' | undefined),
      onsetDate: this.infectionForm.onsetDate,
      interventionNeeded: this.infectionForm.interventionNeeded,
      interventionDetails: this.infectionForm.interventionDetails,
      patientName: this.infectionForm.patientName,
      patientBirthYear: this.infectionForm.patientBirthYear,
      patientGender: this.infectionForm.patientGender,
      patientAddress: this.infectionForm.patientAddress,
      admissionDate: this.infectionForm.admissionDate,
      diagnosisCode: this.infectionForm.diagnosisCode,
      diagnosisName: this.infectionForm.diagnosisName
    };
    this.submit('/module/case-reports', report, 'Đã lưu báo cáo nhiễm khuẩn.');
  }
  saveTransmissionReport(): void {
    if (!this.user) return;
    const report: Partial<TransmissionReport> = {
      type: 'transmission-disease',
      date: this.transmissionForm.date || this.localDate(),
      onsetDate: this.transmissionForm.onsetDate,
      interventionNeeded: this.transmissionForm.interventionNeeded,
      interventionDetails: this.transmissionForm.interventionDetails,
      patientName: this.transmissionForm.patientName,
      patientBirthYear: this.transmissionForm.patientBirthYear,
      patientGender: this.transmissionForm.patientGender,
      patientAddress: this.transmissionForm.patientAddress,
      admissionDate: this.transmissionForm.admissionDate,
      diagnosisName: this.transmissionForm.diagnosisName,
      caseClassification: this.transmissionForm.caseClassification,
      outcome: this.transmissionForm.outcome,
      labResult: this.transmissionForm.labResult,
      caseNote: this.transmissionForm.caseNote,
      isolationStartDate: this.transmissionForm.isolationStartDate,
      isolationEndDate: this.transmissionForm.isolationEndDate,
      preventiveMeasures: this.transmissionForm.preventiveMeasures
    };
    this.submit('/module/case-reports', report, 'Đã lưu báo cáo bệnh truyền nhiễm.');
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
  reportRate(report: Report): string {
    return this.rate(report.risksFound ? Math.round(report.risksClosed / report.risksFound * 1000) / 10 : null);
  }
  caseTypeLabel(type: string): string {
    return type === 'hospital-infection' ? 'Nhiễm khuẩn bệnh viện' : 'Bệnh truyền nhiễm/cách ly';
  }
  infectionTypeLabel(type: string): string {
    return ({ urinary: 'Tiết niệu', respiratory: 'Thở máy', bloodstream: 'Nhiễm khuẩn huyết',
      'surgical-wound': 'Vết mổ' } as Record<string, string>)[type] || type;
  }
  interventionLabel(value: string): string {
    return ({ no: 'Chưa cần can thiệp', dept: 'Trong khoa', ksnk: 'Phối hợp KSNK',
      hospital: 'Phối hợp toàn viện' } as Record<string, string>)[value] || value;
  }
  caseOutcomeLabel(value: string): string {
    return ({ ongoing: 'Đang điều trị/theo dõi', admitted: 'Nhập viện', discharged: 'Ra viện',
      transferred: 'Chuyển viện', deceased: 'Tử vong' } as Record<string, string>)[value] || value;
  }
  monthLabel(month: string): string { return month ? `${month.slice(5, 7)}/${month.slice(0, 4)}` : ''; }
  date(value: string): string {
    if (!value) return '—';
    const parsed = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
    if (!Number.isFinite(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(parsed);
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
  private previousWeekRange(): { from: string; to: string } {
    const today = new Date(`${this.localDate()}T00:00:00Z`);
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    const from = new Date(today);
    from.setUTCDate(today.getUTCDate() - mondayOffset - 7);
    const to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  exportReport(): void {
    if (!this.overview) return;
    if (this.section === 'reports' && this.reportGroup === 'all' && this.canFollowReports &&
        (!this.reportReadiness || !this.reportReadiness.complete)) {
      this.error = 'Chưa đủ báo cáo của bác sĩ và các thành viên mạng lưới khác để xuất báo cáo tổng hợp.';
      return;
    }
    const summary = this.overview.summary;
    const rows: (string | number)[][] = this.section === 'reports' ?
      [['Từ tháng', this.reportFromMonth, 'Đến tháng', this.reportToMonth],
        ['Nhóm báo cáo', this.reportGroup === 'all' ? 'Tất cả mạng lưới' :
          this.reportGroup === 'doctors' ? 'Bác sĩ' : 'Thành viên mạng lưới khác'],
        ...(this.reportReadiness ? [
          ['Mẫu bác sĩ', this.reportReadiness.doctors.submitted, 'Yêu cầu', this.reportReadiness.doctors.required,
            'Hoàn thành (%)', this.reportReadiness.doctors.rate ?? ''],
          ['Mẫu thành viên khác', this.reportReadiness.members.submitted, 'Yêu cầu', this.reportReadiness.members.required,
            'Hoàn thành (%)', this.reportReadiness.members.rate ?? ''],
          ['Đủ mẫu toàn mạng lưới', this.reportReadiness.complete ? 'Có' : 'Chưa'],
        ] : []), [],
        ['Tháng', 'Người báo cáo', 'Khoa', 'Giám sát', 'Vấn đề', 'Đã xử lý xong', 'Tỷ lệ xử lý (%)'],
        ...this.filteredReports.map((report) => [report.month, report.submittedBy, report.departmentName,
          report.monitoringCount, report.risksFound, report.risksClosed,
          report.risksFound ? Math.round(report.risksClosed / report.risksFound * 1000) / 10 : '']),
        ['Tổng', '', '', this.reportTotals.monitoringCount, this.reportTotals.risksFound, this.reportTotals.risksClosed,
          this.reportClosureRate ?? '']] :
      [['Từ ngày', this.from, 'Đến ngày', this.to], [],
      ['Nội dung', 'Lượt làm đúng', 'Lượt kiểm tra', 'Thực hiện chưa đúng', 'Không VST',
        'Tỷ lệ làm đúng (%)', 'Số vấn đề', 'Tỷ lệ trên tổng vấn đề (%)', 'Đã xử lý xong', 'Tỷ lệ xử lý xong (%)'],
      ...this.stats.map((row) => [row.name, row.met, row.checked, row.checked - row.met - row.notPerformed,
        row.notPerformed, row.rate ?? '', row.issues, row.share ?? '', row.closed, row.closedRate ?? '']),
      ['Tổng', '', '', '', summary.risksFound, summary.risksFound ? 100 : '', summary.risksClosed, summary.closureRate ?? '']];
    const sheets = [{ name: 'Báo cáo mạng lưới', rows }];
    if (this.section === 'reports' && this.reportGroup !== 'members' && this.caseReportSummary) {
      sheets.push({ name: 'Tổng hợp ca bệnh', rows: this.caseReportSummaryRows() });
      sheets.push({ name: 'Chi tiết ca bệnh', rows: this.caseReportDetailRows() });
    }
    if (this.section === 'reports' && this.reportTopicSummary.length) {
      sheets.push({ name: 'Theo nội dung', rows: [
        ['Nội dung', 'Lượt quan sát', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)',
          'Vấn đề', 'Tỷ lệ trên tổng vấn đề (%)', 'Đã xử lý', 'Tỷ lệ xử lý (%)'],
        ...this.reportTopicSummary.map((row) => [row.name, row.total, row.met, row.total - row.met - row.notPerformed,
          row.notPerformed, row.rate ?? '',
          row.issues, row.share ?? '', row.closed, row.closedRate ?? '']),
      ] });
    }
    if (this.section === 'reports' && this.reportDepartmentSummary.length) {
      sheets.push({ name: 'Theo khoa', rows: [
        ['Khoa/phòng', 'Nội dung', 'Tổng lượt quan sát', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...this.reportDepartmentSummary.map((item) => [item.departmentName, item.area, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
      ] });
    }
    if (this.section === 'reports' && this.reportRoleSummary.length) {
      sheets.push({ name: 'Theo đối tượng', rows: [
        ['Đối tượng', 'Nội dung', 'Tổng lượt quan sát', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...this.reportRoleSummary.map((item) => [item.role, item.area, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
      ] });
    }
    if (this.section !== 'reports') {
      sheets.push({ name: 'Theo khoa', rows: [
        ['Khoa/phòng', 'Nội dung', 'Tổng cơ hội quan sát', 'Đúng', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...summary.departmentCompliance.map((item) => [item.departmentName, item.area, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
      ] });
      if (summary.roleCompliance.length) {
        sheets.push({ name: 'Theo đối tượng', rows: [
          ['Đối tượng', 'Nội dung', 'Tổng cơ hội quan sát', 'Đúng', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
          ...summary.roleCompliance.map((item) => [item.role, item.area, item.total, item.met,
            item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
        ] });
      }
    }
    this.downloadSpreadsheet(this.section === 'reports'
      ? `ksnk-${this.reportFromMonth}-${this.reportToMonth}.xls`
      : `ksnk-${this.from}-${this.to}.xls`, sheets);
  }
  exportCaseReports(): void {
    if (!this.caseReportSummary) return;
    this.downloadSpreadsheet(`ksnk-ca-benh-${this.caseReportFromDate}-${this.caseReportToDate}.xls`, [
      { name: 'Tổng hợp ca bệnh', rows: this.caseReportSummaryRows() },
      { name: 'Chi tiết ca bệnh', rows: this.caseReportDetailRows() },
    ]);
  }
  exportWeeklyReport(): void {
    const summary = this.selectedWeeklySummary;
    if (!this.weeklyRangeValid || !summary) {
      this.error = 'Chọn đúng tuần và chờ tải đủ số liệu trước khi xuất.';
      return;
    }
    if (this.weeklyReportGroup === 'all' && this.canFollowReports &&
        (!this.weeklyReportReadiness || !this.weeklyReportReadiness.complete)) {
      this.error = 'Chưa đủ báo cáo tuần của bác sĩ và thành viên mạng lưới khác để xuất báo cáo tổng hợp.';
      return;
    }
    const groupLabel = this.weeklyReportGroup === 'all' ? 'Tất cả mạng lưới' :
      this.weeklyReportGroup === 'doctors' ? 'Bác sĩ' : 'Thành viên mạng lưới khác';
    const sheets = [
      { name: 'Tổng hợp tuần', rows: [
        ['Kỳ báo cáo', this.weekFrom, this.weekTo], ['Nhóm báo cáo', groupLabel],
        ...(this.weeklyReportReadiness ? [
          ['Báo cáo bác sĩ', this.weeklyReportReadiness.doctors.submitted, 'Yêu cầu', this.weeklyReportReadiness.doctors.required,
            'Hoàn thành (%)', this.weeklyReportReadiness.doctors.rate ?? ''],
          ['Báo cáo thành viên khác', this.weeklyReportReadiness.members.submitted, 'Yêu cầu', this.weeklyReportReadiness.members.required,
            'Hoàn thành (%)', this.weeklyReportReadiness.members.rate ?? ''],
          ['Đủ mẫu toàn mạng lưới', this.weeklyReportReadiness.complete ? 'Có' : 'Chưa'],
        ] : []),
        ['Lượt giám sát', summary.monitoringCount], ['Vấn đề ghi nhận', summary.risksFound],
        ['Đã xử lý', summary.risksClosed], ['Tỷ lệ xử lý (%)', summary.closureRate ?? ''],
        [],
        ['Nội dung giám sát', 'Lượt quan sát', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...summary.compliance.map((item) => [item.name, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
        [],
        ['Nội dung vấn đề', 'Số lượng', 'Tỷ lệ trên tổng (%)', 'Đã xử lý', 'Tỷ lệ xử lý (%)'],
        ...summary.categories.map((item) => [item.name, item.total, item.share ?? '', item.closed, item.rate ?? '']),
      ] },
      { name: 'Hoạt động thành viên', rows: [
        ['Bác sĩ/thành viên', 'Chức danh', 'Khoa/phòng', 'Công việc đã triển khai', 'Khó khăn',
          'Kế hoạch tuần tới', 'Đề xuất/kiến nghị'],
        ...this.filteredWeeklyReports.map((item) => [item.submittedBy, item.memberType, item.departmentName,
          item.activities, item.difficulties, item.nextWeekPlan, item.recommendations]),
      ] },
    ];
    if (summary.departmentCompliance.length) {
      sheets.push({ name: 'Theo khoa', rows: [
        ['Khoa/phòng', 'Nội dung', 'Tổng cơ hội', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...summary.departmentCompliance.map((item) => [item.departmentName, item.area, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
      ] });
    }
    if (summary.roleCompliance.length) {
      sheets.push({ name: 'Theo đối tượng', rows: [
        ['Đối tượng', 'Nội dung', 'Tổng cơ hội', 'Đạt', 'Thực hiện chưa đúng', 'Không VST', 'Tỷ lệ đúng (%)'],
        ...summary.roleCompliance.map((item) => [item.role, item.area, item.total, item.met,
          item.total - item.met - item.notPerformed, item.notPerformed, item.rate ?? '']),
      ] });
    }
    if (this.weeklyReportGroup !== 'members' && this.weeklyCaseReportSummary) {
      sheets.push({ name: 'Tổng hợp ca bệnh', rows: this.caseReportSummaryRows(
        this.weeklyCaseReportSummary, this.weekFrom, this.weekTo) });
      sheets.push({ name: 'Chi tiết ca bệnh', rows: this.caseReportDetailRows(this.weeklyCaseReports) });
    }
    this.downloadSpreadsheet(`ksnk-tuan-${this.weekFrom}-${this.weekTo}.xls`, sheets);
  }
  private caseReportSummaryRows(summary = this.caseReportSummary, from = this.caseReportFromDate,
    to = this.caseReportToDate): (string | number)[][] {
    if (!summary) return [];
    return [
      ['Từ ngày', from, 'Đến ngày', to],
      ['Tổng phiếu', summary.total, 'Nhiễm khuẩn bệnh viện', summary.hospitalInfections,
        'Bệnh truyền nhiễm/cách ly', summary.transmissionDiseases],
      [],
      ['Phương án xử trí', 'Số ca', 'Tỷ lệ (%)'],
      ...summary.interventionStats.map((item) => [this.interventionLabel(item.value), item.count, item.rate ?? '']),
      [],
      ['Loại nhiễm khuẩn bệnh viện', 'Số ca', 'Tỷ lệ trong nhóm (%)'],
      ...summary.infectionTypes.map((item) => [this.infectionTypeLabel(item.type), item.count, item.rate ?? '']),
      [],
      ['Bệnh truyền nhiễm', 'Tổng ca', 'Nghi ngờ', 'Nghi ngờ (%)', 'Xác định', 'Xác định (%)',
        'Nhập viện', 'Nhập viện (%)', 'Ra viện', 'Ra viện (%)', 'Chuyển viện', 'Chuyển viện (%)',
        'Tử vong', 'Tử vong (%)', 'Tỷ lệ trong nhóm (%)'],
      ...summary.transmissionByDisease.map((item) => [item.disease, item.total, item.suspected, item.suspectedRate ?? '',
        item.confirmed, item.confirmedRate ?? '', item.admitted, item.admittedRate ?? '',
        item.discharged, item.dischargedRate ?? '', item.transferred, item.transferredRate ?? '',
        item.deceased, item.deceasedRate ?? '', item.rate ?? '']),
    ];
  }
  private caseReportDetailRows(reports = this.caseReports): (string | number)[][] {
    return [
      ['Ngày', 'Loại phiếu', 'Bác sĩ', 'Mã nhân viên', 'Khoa', 'Mã ca/tên giả', 'Năm sinh',
        'Giới tính', 'Địa chỉ (dữ liệu giả)', 'Ngày nhập viện', 'Chẩn đoán',
        'Phân loại ca', 'Kết quả/diễn biến', 'Kết quả xét nghiệm', 'Loại nhiễm khuẩn',
        'Bắt đầu cách ly', 'Kết thúc cách ly', 'Biện pháp phòng ngừa', 'Ghi chú',
        'Phương án xử trí', 'Chi tiết xử trí'],
      ...reports.map((item) => [item.date, this.caseTypeLabel(item.type), item.doctor, item.employeeCode,
        item.departmentName, item.patientName, item.patientBirthYear ?? '', item.patientGender,
        item.patientAddress, item.admissionDate, item.diagnosisName,
        item.caseClassification === 'suspected' ? 'Nghi ngờ' : item.caseClassification === 'confirmed' ? 'Xác định' : '',
        this.caseOutcomeLabel(item.outcome), item.labResult,
        item.type === 'hospital-infection' ? this.infectionTypeLabel(item.infectionType) : '',
        item.isolationStartDate, item.isolationEndDate, item.preventiveMeasures, item.caseNote,
        this.interventionLabel(item.interventionNeeded), item.interventionDetails]),
    ];
  }
  private downloadSpreadsheet(filename: string, sheets: { name: string; rows: (string | number)[][] }[]): void {
    const xmlEscape = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      sheets.map((sheet) => `<Worksheet ss:Name="${xmlEscape(sheet.name)}"><Table>` +
        sheet.rows.map((row) => `<Row>${row.map((cell) => {
          const number = typeof cell === 'number' && Number.isFinite(cell);
          return `<Cell><Data ss:Type="${number ? 'Number' : 'String'}">${xmlEscape(String(cell))}</Data></Cell>`;
        }).join('')}</Row>`).join('') +
        `</Table></Worksheet>`).join('') + `</Workbook>`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    link.click(); URL.revokeObjectURL(url);
  }
  private fail(error: HttpErrorResponse): void { this.error = error.error?.message || 'Không tải được dữ liệu. Vui lòng thử lại.'; }
}
