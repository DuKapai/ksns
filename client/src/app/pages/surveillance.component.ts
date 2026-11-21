import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, User } from '../core/api.service';

type BundleKey = 'VAP' | 'CAUTI' | 'SSI' | 'CLABSI';
interface BundleCount { eligible: number; compliant: number; rate: number | null; }
interface DepartmentDay {
  departmentCode: string;
  departmentName: string;
  doctorNames: string[];
  nurseNames: string[];
  doctorSubmitted: boolean;
  doctorEntry: { submittedBy: string; submittedAt: string; bundles: Record<BundleKey, BundleCount> } | null;
  nurseHandHygieneSubmitted: boolean;
  handHygieneCount: number;
  handHygieneOpportunities: number;
  handHygieneCompliant: number;
  handHygieneRate: number | null;
  bundles: Record<BundleKey, BundleCount>;
  suspectedCaseCount: number;
  awaitingCouncilCount: number;
  alerts?: { departmentName: string; role: string }[];
}
interface DailyData {
  date: string;
  overdue: boolean;
  dueTime: string;
  departments: DepartmentDay[];
  alerts: { departmentName: string; missing: string }[];
}
interface MonthlySummary {
  month: string;
  handHygiene: { observationCount: number; opportunities: number; compliant: number; rate: number | null };
  bundles: Record<BundleKey, BundleCount>;
  suspectedCaseCount: number;
  submittedToCouncilCount: number;
  awaitingCouncilCount: number;
  isolation: Record<string, number>;
}
interface SuspectedCase {
  id: string;
  code: string;
  date: string;
  detectedAt: string;
  type: string;
  departmentCode: string;
  departmentName: string;
  location: string;
  findings: string;
  isolationStatus: string;
  isolationType: string;
  initialAction: string;
  notifiedTo: string;
  notifiedAt: string;
  reportedBy: string;
  status: string;
  councilStatus: string;
  councilReference: string;
  committeeDecision: string;
  decisionRationale: string;
  reviewedBy: string;
}

@Component({
  selector: 'app-surveillance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .warning { background:#fff5da; border-left:4px solid #cf921a; padding:13px 15px; margin-bottom:16px; line-height:1.5; }
    .error { background:#fff0f0; border-left:4px solid #bb3d3d; padding:12px; margin:12px 0; color:#8d2424; }
    .success { background:#e9f8ef; padding:12px; margin:12px 0; color:#246840; }
    .tabs,.actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
    .tabs button { border:1px solid #d5e0e8; background:white; border-radius:8px; padding:9px 13px; cursor:pointer; color:#345168; }
    .tabs button.active { background:#126c85; border-color:#126c85; color:white; }
    .fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; }
    .fields label { display:block; font-weight:600; margin-bottom:5px; }
    .fields input,.fields select,.fields textarea { width:100%; padding:9px; border:1px solid #cad7df; border-radius:7px; background:white; font:inherit; }
    .wide { grid-column:1 / -1; }
    .bundle-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:12px; }
    .bundle { border:1px solid #dce5eb; border-radius:8px; padding:12px; }
    .bundle h4 { margin:0 0 8px; }
    .panel { margin-bottom:16px; }
    .record { padding:14px 0; border-top:1px solid #e3eaee; }
    .record p { margin:5px 0; line-height:1.5; }
    .status { display:inline-block; background:#edf5f8; padding:5px 8px; border-radius:5px; margin:3px; }
    .alert { color:#9b2c2c; font-weight:600; }
    .muted { color:#617487; font-size:12px; line-height:1.5; }
    .scroll { overflow-x:auto; }
    table { min-width:940px; width:100%; }
  `],
  template: `
    <div class="warning"><b>{{isKsnk ? 'Theo dõi kết quả giám sát của các khoa.' : 'Bắt đầu từ “Giám sát trong ngày”.'}}</b>
      Chỉ dùng số liệu mô phỏng; không nhập thông tin nhận dạng người bệnh. Ca nghi ngờ phải báo trực tiếp, phần mềm không chẩn đoán.</div>
    <div class="tabs">
      <button *ngFor="let tab of tabs" type="button" [class.active]="view===tab.key" (click)="selectTab(tab.key)">{{tab.label}}</button>
    </div>
    <div class="error" *ngIf="error" role="alert">{{error}}</div>
    <div class="success" *ngIf="success" role="status">{{success}}</div>

    <section *ngIf="view==='daily'">
      <div class="panel">
        <div class="panel-heading"><div><h3>{{isKsnk ? '1. Theo dõi các khoa' : '1. Giám sát trong ngày'}}</h3><p>Bác sĩ nhập số liệu; điều dưỡng ghi phiếu vệ sinh tay tại “Phiếu giám sát”.</p></div></div>
        <div class="fields"><div><label>Ngày theo dõi</label><input type="date" [(ngModel)]="date" (ngModelChange)="loadDay()" [ngModelOptions]="{standalone:true}"></div></div>
        <div class="actions" *ngIf="canReportCase"><button type="button" class="outline-button" (click)="selectTab('cases')">Ghi nhận ca nghi ngờ</button></div>
        <div class="alert" *ngIf="day?.overdue && day?.alerts?.length">Cảnh báo quá hạn: {{day?.alerts?.length}} mục chưa nhập theo mốc demo 16:00.</div>
        <p class="muted" *ngIf="!day?.overdue">Chưa đến hạn nhắc trong ngày. Mốc 16:00 chỉ để minh họa, chờ KSNK phê duyệt/cấu hình.</p>
        <div class="record" *ngFor="let dept of day?.departments">
          <b>{{dept.departmentName}}</b>
          <span class="status" [class.alert]="day?.overdue && !dept.doctorSubmitted">Bác sĩ: {{dept.doctorSubmitted ? 'Đã nhập' : (day?.overdue ? 'Chưa nhập' : 'Chưa ghi nhận')}}</span>
          <span class="status" [class.alert]="day?.overdue && dept.nurseNames.length>0 && !dept.nurseHandHygieneSubmitted">Điều dưỡng · vệ sinh tay: {{dept.nurseHandHygieneSubmitted ? 'Đã có phiếu' : (day?.overdue ? 'Chưa nhập' : 'Chưa ghi nhận')}}</span>
          <span class="status">VST: {{dept.handHygieneCompliant}}/{{dept.handHygieneOpportunities}}<span *ngIf="dept.handHygieneRate!==null"> · {{dept.handHygieneRate}}%</span><span *ngIf="dept.handHygieneRate===null"> · Chưa có mẫu số</span></span>
          <span class="status">Ca nghi ngờ: {{dept.suspectedCaseCount}} · Chờ HĐKH: {{dept.awaitingCouncilCount}}</span>
          <span class="status" *ngFor="let key of bundleKeys">{{key}}: <ng-container *ngIf="dept.doctorSubmitted; else notEntered">{{dept.bundles[key].compliant}}/{{dept.bundles[key].eligible}}<span *ngIf="dept.bundles[key].rate!==null"> · {{dept.bundles[key].rate}}%</span></ng-container><ng-template #notEntered>Chưa nhập</ng-template></span>
        </div>
        <p *ngIf="!day?.departments?.length">Chưa có thành viên mạng lưới hoạt động trong phạm vi tài khoản.</p>
        <div *ngFor="let alert of day?.alerts" class="alert">⚠ {{alert.departmentName}} — {{alert.missing}}</div>
      </div>
      <div class="panel" *ngIf="isDoctor">
        <h3>Nhập kết quả gói phòng ngừa</h3>
        <p class="muted">Mỗi gói chỉ cần nhập số đối tượng đủ điều kiện và số tuân thủ đầy đủ. Không có đối tượng thì nhập 0/0.</p>
        <form (ngSubmit)="saveDaily()">
          <p>Ngày ghi nhận: {{date | date:'dd/MM/yyyy'}}</p>
          <div class="bundle-grid">
            <div class="bundle" *ngFor="let key of bundleKeys"><h4>{{key}}</h4><p class="muted">{{bundleDescriptions[key]}}</p>
              <div><label>Đủ điều kiện rà soát</label><input type="number" min="0" step="1" [name]="key+'Eligible'" [(ngModel)]="dailyForm.bundles[key].eligible" required placeholder="Nhập số"></div>
              <div><label>Tuân thủ đầy đủ gói</label><input type="number" min="0" step="1" [name]="key+'Compliant'" [(ngModel)]="dailyForm.bundles[key].compliant" required placeholder="Nhập số"></div>
            </div>
          </div>
          <p class="muted">Danh sách ca chỉ bao gồm những phiếu đã ghi, không xác nhận không có ca chưa được phát hiện.</p>
          <div class="actions"><button class="primary-button compact" [disabled]="saving || loadingDay">Lưu số liệu trong ngày</button></div>
        </form>
      </div>
      <div class="panel" *ngIf="isNurse">
        <h3>Điều dưỡng mạng lưới</h3>
        <p>Chọn “Phiếu vệ sinh tay” để ghi số cơ hội và số đạt. Nếu không có cơ hội, hệ thống không tính tỷ lệ.</p>
        <button type="button" class="primary-button compact" (click)="goToHandHygiene()">Mở phiếu giám sát vệ sinh tay</button>
      </div>
    </section>

    <section *ngIf="view==='cases'">
      <div class="panel" *ngIf="canReportCase">
        <h3>Phiếu ca nghi ngờ bệnh truyền nhiễm / nguy cơ lây truyền và cách ly</h3>
        <p class="muted">Ghi dấu hiệu, vị trí, biện pháp đã thực hiện và tình trạng cách ly. Báo trực tiếp KSNK, lãnh đạo khoa và cấp có thẩm quyền ngay theo quy trình; lưu phiếu không tự động gửi cảnh báo đến người nhận.</p>
        <form (ngSubmit)="saveCase()">
          <div class="fields">
            <div><label>Thời điểm phát hiện</label><input type="datetime-local" name="detectedAt" [(ngModel)]="caseForm.detectedAt" required></div>
            <div><label>Nhóm tình huống</label><select name="caseType" [(ngModel)]="caseForm.type"><option>Nghi ngờ NKBV</option><option>Bệnh truyền nhiễm cần đánh giá</option><option>Nguy cơ lây truyền khác</option></select></div>
            <div><label>Khoa / khu vực</label><input name="caseLocation" [(ngModel)]="caseForm.location" required></div>
            <div><label>Tình trạng áp dụng cách ly</label><select name="isolationStatus" [(ngModel)]="caseForm.isolationStatus"><option>Đã áp dụng</option><option>Đang bố trí</option><option>Chưa chỉ định</option><option>Không áp dụng</option></select></div>
            <div><label>Loại phòng ngừa/cách ly theo chỉ định</label><select name="isolationType" [(ngModel)]="caseForm.isolationType"><option>Chưa xác định</option><option>Tiếp xúc</option><option>Giọt bắn</option><option>Không khí</option><option>Kết hợp</option><option>Theo chỉ định</option></select></div>
            <div class="wide"><label>Dấu hiệu / lý do nghi ngờ cần đánh giá</label><textarea name="findings" [(ngModel)]="caseForm.findings" rows="3" required></textarea></div>
            <div class="wide"><label>Biện pháp ban đầu đã thực hiện</label><textarea name="initialAction" [(ngModel)]="caseForm.initialAction" rows="2" required></textarea></div>
            <div><label>Người / đơn vị đã báo trực tiếp</label><input name="notifiedTo" [(ngModel)]="caseForm.notifiedTo" placeholder="Nếu chưa báo, để trống và báo ngay"></div>
            <div><label>Thời điểm đã báo</label><input type="datetime-local" name="notifiedAt" [(ngModel)]="caseForm.notifiedAt"></div>
          </div>
          <div class="actions"><button class="primary-button compact" [disabled]="saving">Lưu phiếu và chuyển theo dõi</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-heading"><div><h3>Danh sách ca cần theo dõi / thẩm định</h3><p>Khoảng tuần: {{week.from}} đến {{week.to}} · Dữ liệu chỉ hiển thị trong phạm vi quyền.</p></div><button class="outline-button" type="button" (click)="exportCases()">Xuất danh sách tuần</button></div>
        <div class="fields"><div><label>Từ ngày</label><input type="date" [(ngModel)]="week.from" (ngModelChange)="loadCases()" [ngModelOptions]="{standalone:true}"></div><div><label>Đến ngày</label><input type="date" [(ngModel)]="week.to" (ngModelChange)="loadCases()" [ngModelOptions]="{standalone:true}"></div></div>
        <article class="record" *ngFor="let item of cases">
          <b>{{item.code}} · {{item.departmentName}} · {{item.type}} · {{item.detectedAt | date:'dd/MM/yyyy HH:mm'}}</b>
          <p>{{item.location}} · Người ghi nhận: {{item.reportedBy}} · Trạng thái: {{item.status}} · Hội đồng: {{item.councilStatus}}</p>
          <p>Dấu hiệu: {{item.findings}}</p>
          <p>Cách ly: {{item.isolationStatus}} · Hình thức: {{item.isolationType}} · Xử trí: {{item.initialAction}}</p>
          <p>Đã báo trực tiếp: {{item.notifiedTo || 'Chưa ghi nhận — cần xác nhận kênh trực tiếp'}} · {{item.notifiedAt || 'Chưa ghi thời điểm'}}</p>
          <p *ngIf="item.councilReference">Mã biên bản / phiếu chuyển HĐKH: {{item.councilReference}}</p>
          <p *ngIf="item.committeeDecision">Kết luận HĐKH được ghi nhận: {{item.committeeDecision}} · {{item.decisionRationale}} · Người nhập kết luận: {{item.reviewedBy}}</p>
          <div class="actions" *ngIf="isKsnk && item.councilStatus==='Chưa trình'">
            <input [(ngModel)]="councilReferences[item.id]" [ngModelOptions]="{standalone:true}" placeholder="Mã biên bản / phiếu chuyển">
            <button type="button" class="outline-button" (click)="submitToCouncil(item)">Ghi nhận trình HĐKH</button>
          </div>
          <div class="actions" *ngIf="canAdjudicate && item.councilStatus==='Chờ HĐKH thẩm định'">
            <select [(ngModel)]="decisionForms[item.id].decision" [ngModelOptions]="{standalone:true}"><option>Đạt định nghĩa ca theo kết luận HĐKH</option><option>Không đạt định nghĩa ca theo kết luận HĐKH</option><option>Chưa đủ dữ liệu</option></select>
            <input [(ngModel)]="decisionForms[item.id].rationale" [ngModelOptions]="{standalone:true}" placeholder="Căn cứ / mã biên bản HĐKH">
            <button type="button" class="outline-button" (click)="saveDecision(item)">Ghi nhận kết luận HĐKH</button>
          </div>
        </article>
        <p *ngIf="!cases.length">Không có ca ghi nhận trong khoảng ngày này.</p>
      </div>
    </section>

    <section *ngIf="view==='metrics'">
      <div class="panel">
        <h3>Kết quả giám sát và tuân thủ theo kỳ</h3>
        <div class="fields"><div><label>Tháng</label><input type="month" [(ngModel)]="month" (ngModelChange)="loadSummary()" [ngModelOptions]="{standalone:true}"></div></div>
        <div *ngIf="summary">
          <h4>Vệ sinh tay — điều dưỡng mạng lưới</h4>
          <p>{{summary.handHygiene.compliant}}/{{summary.handHygiene.opportunities}} cơ hội<span *ngIf="summary.handHygiene.rate!==null"> · {{summary.handHygiene.rate}}%</span><span *ngIf="summary.handHygiene.rate===null"> · Chưa đủ mẫu số để tính tỷ lệ</span> · {{summary.handHygiene.observationCount}} phiếu</p>
          <h4>Tuân thủ đầy đủ gói phòng ngừa</h4>
          <p class="muted">Tỷ lệ = số đối tượng tuân thủ toàn bộ gói / số đối tượng đủ điều kiện được rà soát. Các thành phần gói, tiêu chuẩn ca và phương pháp lấy mẫu cần KSNK&amp;PCBT/HĐKH phê duyệt. Không gộp mẫu số giữa các chỉ số.</p>
          <div class="bundle-grid"><div class="bundle" *ngFor="let key of bundleKeys"><h4>{{key}}</h4><p>{{summary.bundles[key].compliant}}/{{summary.bundles[key].eligible}} đối tượng<span *ngIf="summary.bundles[key].rate!==null"> · {{summary.bundles[key].rate}}%</span><span *ngIf="summary.bundles[key].rate===null"> · Chưa có mẫu số</span></p><p class="muted">{{bundleDescriptions[key]}}</p></div></div>
          <h4>Bệnh truyền nhiễm / cách ly / ca nghi ngờ NKBV</h4>
          <p>Ca nghi ngờ: {{summary.suspectedCaseCount}} · Đã chuyển HĐKH: {{summary.submittedToCouncilCount}} · Chờ thẩm định/bổ sung: {{summary.awaitingCouncilCount}}</p>
          <p>Trạng thái cách ly: <span class="status" *ngFor="let status of isolationStatuses">{{status}}: {{summary.isolation[status] || 0}}</span></p>
        </div>
      </div>
    </section>
  `
})
export class SurveillanceComponent implements OnInit {
  readonly user: User | null = this.api.user;
  readonly isDoctor = this.user?.roles.includes('MEMBER_DOCTOR') ?? false;
  readonly isNurse = this.user?.roles.includes('MEMBER_NURSE') ?? false;
  readonly canReportCase = this.isDoctor || this.isNurse;
  readonly isKsnk = this.user?.roles.some(role => ['KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY', 'NETWORK_SECRETARY'].includes(role)) ?? false;
  readonly canAdjudicate = this.user?.roles.some(role => ['KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY'].includes(role)) ?? false;
  readonly bundleKeys: BundleKey[] = ['VAP', 'CAUTI', 'SSI', 'CLABSI'];
  readonly bundleDescriptions: Record<BundleKey, string> = {
    VAP: 'Viêm phổi liên quan thở máy',
    CAUTI: 'Nhiễm khuẩn tiết niệu liên quan catheter',
    SSI: 'Nhiễm khuẩn vết mổ',
    CLABSI: 'Nhiễm khuẩn huyết liên quan catheter trung tâm'
  };
  readonly isolationStatuses = ['Đã áp dụng', 'Đang bố trí', 'Chưa chỉ định', 'Không áp dụng'];
  readonly tabs: {key:string;label:string}[] = [
    {key:'daily',label:'1. Giám sát hôm nay'},
    {key:'cases',label:'2. Ca nghi ngờ'},
    {key:'metrics',label:'3. Tổng hợp tháng'}
  ];
  view = 'daily';
  date = this.localDate();
  month = this.date.slice(0, 7);
  week = this.currentWeek();
  day: DailyData | null = null;
  summary: MonthlySummary | null = null;
  cases: SuspectedCase[] = [];
  councilReferences: Record<string, string> = {};
  decisionForms: Record<string, {decision:string;rationale:string}> = {};
  dailyForm = this.newDailyForm();
  caseForm = this.newCaseForm();
  saving = false;
  loadingDay = false;
  error = '';
  success = '';
  constructor(private api: ApiService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    this.selectTab(this.tabs.some(item => item.key === tab) ? tab! : 'daily');
  }
  localDate(offset = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  currentWeek(): {from:string;to:string} {
    const today = new Date();
    const weekday = (today.getDay()+6)%7;
    const from = this.localDate(-weekday);
    const end = new Date(`${from}T00:00:00`);
    end.setDate(end.getDate()+6);
    return {from, to:`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`};
  }
  newDailyForm() {
    return {date:this.localDate(),bundles:{
      VAP:{eligible:null,compliant:null}, CAUTI:{eligible:null,compliant:null},
      SSI:{eligible:null,compliant:null}, CLABSI:{eligible:null,compliant:null}
    } as Record<BundleKey,{eligible:number|null;compliant:number|null}>};
  }
  newCaseForm() {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return {detectedAt:local,type:'Nghi ngờ NKBV',location:'',findings:'',isolationStatus:'Đang bố trí',isolationType:'Chưa xác định',initialAction:'',notifiedTo:'',notifiedAt:''};
  }
  selectTab(tab:string):void { this.view=tab; this.error=''; this.success=''; if(tab==='daily')this.loadDay();if(tab==='cases')this.loadCases();if(tab==='metrics')this.loadSummary(); }
  loadDay():void {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(this.date)){this.loadingDay=true;this.day=null;return;}
    this.error='';
    const requestedDate = this.date;
    this.loadingDay=true;
    if(this.isDoctor)this.dailyForm={...this.newDailyForm(),date:requestedDate};
    const endpoint=this.isKsnk?'/surveillance/daily-status':'/surveillance/daily';
    this.api.get<DailyData>(`${endpoint}?date=${encodeURIComponent(this.date)}`).subscribe({
      next:r=>{if(requestedDate!==this.date)return;this.loadingDay=false;this.day=r;if(this.isDoctor){const entry=r.departments.find(item=>item.departmentCode===this.user?.departmentCode)?.doctorEntry;if(entry){this.dailyForm={date:requestedDate,bundles:{
        VAP:{eligible:entry.bundles.VAP.eligible,compliant:entry.bundles.VAP.compliant},
        CAUTI:{eligible:entry.bundles.CAUTI.eligible,compliant:entry.bundles.CAUTI.compliant},
        SSI:{eligible:entry.bundles.SSI.eligible,compliant:entry.bundles.SSI.compliant},
        CLABSI:{eligible:entry.bundles.CLABSI.eligible,compliant:entry.bundles.CLABSI.compliant}
      }};}}},
      error:e=>{if(requestedDate!==this.date)return;this.loadingDay=true;this.day=null;this.fail(e,'Không tải được tình trạng nhập liệu trong ngày. Chọn lại ngày để thử lại.');}
    });
  }
  loadCases():void {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(this.week.from)||!/^\d{4}-\d{2}-\d{2}$/.test(this.week.to)||this.week.from>this.week.to)return;
    this.api.get<{items:SuspectedCase[]}>(`/surveillance/cases?from=${encodeURIComponent(this.week.from)}&to=${encodeURIComponent(this.week.to)}`).subscribe({
      next:r=>{this.cases=r.items;for(const item of this.cases){this.councilReferences[item.id]=item.councilReference||'';this.decisionForms[item.id]={decision:'Chưa đủ dữ liệu',rationale:''};}},
      error:e=>this.fail(e,'Không tải được danh sách ca.')
    });
  }
  loadSummary():void {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.month))return;
    this.api.get<{summary:MonthlySummary}>(`/surveillance/summary?month=${encodeURIComponent(this.month)}`).subscribe({next:r=>this.summary=r.summary,error:e=>this.fail(e,'Không tổng hợp được chỉ số.')});
  }
  saveDaily():void {
    this.saving=true;this.error='';this.success='';
    this.api.put<{item:unknown}>('/surveillance/daily',this.dailyForm).subscribe({
      next:()=>{this.saving=false;this.success='Đã ghi nhận báo cáo chuyên môn trong ngày.';this.loadDay();},
      error:e=>{this.saving=false;this.fail(e,'Không lưu được báo cáo ngày.');}
    });
  }
  saveCase():void {
    this.saving=true;this.error='';this.success='';
    this.api.post<{item:SuspectedCase}>('/surveillance/cases',this.caseForm).subscribe({
      next:()=>{this.saving=false;this.success='Đã ghi nhận phiếu ca nghi ngờ. Hãy báo trực tiếp KSNK và lãnh đạo khoa ngay theo quy trình.';this.caseForm=this.newCaseForm();this.loadCases();this.loadDay();},
      error:e=>{this.saving=false;this.fail(e,'Không lưu được phiếu ca.');}
    });
  }
  submitToCouncil(item:SuspectedCase):void {
    this.api.patch<{item:SuspectedCase}>(`/surveillance/cases/${item.id}`,{action:'submit-to-council',councilReference:this.councilReferences[item.id]}).subscribe({
      next:()=>{this.success='Đã lưu trạng thái trình HĐKH.';this.loadCases();},
      error:e=>this.fail(e,'Không cập nhật được trạng thái trình HĐKH.')
    });
  }
  saveDecision(item:SuspectedCase):void {
    this.api.patch<{item:SuspectedCase}>(`/surveillance/cases/${item.id}`,{action:'adjudicate',...this.decisionForms[item.id]}).subscribe({
      next:()=>{this.success='Đã ghi nhận kết luận do HĐKH cung cấp.';this.loadCases();this.loadSummary();},
      error:e=>this.fail(e,'Không lưu được kết luận HĐKH.')
    });
  }
  exportCases():void {
    const headers=['Mã phiếu','Ngày phát hiện','Khoa','Nhóm tình huống','Vị trí','Dấu hiệu/lý do','Cách ly','Hình thức','Xử trí ban đầu','Đã báo','Hội đồng','Kết luận','Mã biên bản'];
    const rows=this.cases.map(item=>[item.code,item.detectedAt,item.departmentName,item.type,item.location,item.findings,item.isolationStatus,item.isolationType,item.initialAction,item.notifiedTo,item.councilStatus,item.committeeDecision,item.councilReference]);
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`ca-nghi-ngo-ksnk-${this.week.from}-${this.week.to}.csv`;link.click();URL.revokeObjectURL(url);
  }
  goToHandHygiene():void { this.router.navigate(['/app/monitorings'], { queryParams: { create: 'hand-hygiene' } }); }
  fail(error:{error?:{message?:string}},fallback:string):void { this.error=error?.error?.message||fallback; }
}
