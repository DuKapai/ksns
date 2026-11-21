import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, User } from '../core/api.service';

interface Config {
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyWeeklyTarget: number;
  reportDay: number;
}
interface Criterion {
  label: string;
  result: string;
  evidence: string;
  reason: string;
}
interface Observation {
  id: string;
  code: string;
  date: string;
  period: string;
  topic: string;
  method: string;
  location: string;
  sampleSize: number;
  criteria: Criterion[];
  summary: string;
  followUp: string;
  notifiedTo: string;
  notifiedAt: string;
  observer: string;
  departmentName: string;
}
interface Summary {
  month: string;
  monitoringCount: number;
  weeklyCount: number;
  sampleSize: number;
  criteriaApplicable: number;
  criteriaMet: number;
  criteriaNotMet: number;
  criteriaUnknown: number;
  riskCount: number;
  openRiskCount: number;
  closedRiskCount: number;
}
interface Report {
  id: string;
  month: string;
  submittedBy: string;
  departmentName: string;
  activities: string;
  incidents: string;
  recommendations: string;
  summary: Summary;
  status: string;
}
interface TrackerRow {
  employeeCode: string;
  fullName: string;
  departmentCode: string;
  departmentName: string;
  monitoringCount: number;
  weeklyCount: number;
  riskCount: number;
  openRiskCount: number;
  closedRiskCount: number;
  reportStatus: string;
  assessment: Assessment | null;
}
interface Assessment {
  status: string;
  weeklyCount: number;
  weeklyTarget: number;
  reportSubmitted: boolean;
  hasEvidence: boolean;
  riskFollowed: boolean;
  verified: boolean;
  evidence: string;
  note: string;
  reviewer: string;
  createdAt: string;
}

@Component({
  selector: 'app-doctor-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
    .tabs button { border:1px solid #d5e0e8; background:white; border-radius:8px; padding:9px 13px; cursor:pointer; color:#345168; }
    .tabs button.active { background:#126c85; border-color:#126c85; color:white; }
    .block { margin-bottom:18px; }
    .block h3 { margin:0 0 10px; }
    .block p, .block li { line-height:1.55; }
    .block ul, .block ol { padding-left:22px; }
    .warning { background:#fff5da; border-left:4px solid #cf921a; padding:13px 15px; margin-bottom:18px; line-height:1.5; }
    .error { background:#fff0f0; border-left:4px solid #bb3d3d; padding:12px; margin:12px 0; color:#8d2424; }
    .success { background:#e9f8ef; padding:12px; margin:12px 0; color:#246840; }
    .fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; }
    .fields label, .criterion label { display:block; font-weight:600; margin-bottom:5px; }
    .fields input, .fields select, .fields textarea, .criterion input, .criterion select, .criterion textarea {
      width:100%; padding:9px; border:1px solid #cad7df; border-radius:7px; background:white; font:inherit;
    }
    .wide { grid-column:1 / -1; }
    .criterion { border:1px solid #dce5eb; border-radius:8px; padding:12px; margin:10px 0; }
    .criterion b { display:block; margin-bottom:10px; }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .muted-small { font-size:12px; color:#617487; line-height:1.5; }
    .statline { display:flex; flex-wrap:wrap; gap:10px; margin:12px 0; }
    .statline span { background:#edf5f8; padding:8px 10px; border-radius:6px; }
    .record { padding:15px 0; border-top:1px solid #e3eaee; }
    .record p { margin:5px 0; }
    .scroll { overflow-x:auto; }
    .scroll table { min-width:850px; }
  `],
  template: `
    <div class="warning"><b>Đề xuất dùng thử, chưa phải quy định được phê duyệt.</b>
      Các mốc thời gian, số lượt và tiêu chí dưới đây cần Khoa KSNK&amp;PCBT và bệnh viện rà soát trước vận hành.
      Không nhập thông tin người bệnh thật. Phần mềm không chẩn đoán nhiễm khuẩn và không thay thế thông báo trực tiếp.</div>
    <div class="tabs">
      <button *ngFor="let tab of tabs" type="button" [class.active]="view===tab.key" (click)="selectTab(tab.key)">{{tab.label}}</button>
    </div>
    <div class="error" *ngIf="error" role="alert">{{error}}</div>
    <div class="success" *ngIf="success" role="status">{{success}}</div>

    <section class="panel block" *ngIf="view==='plan'">
      <h3>Quy định nhiệm vụ và lịch làm việc đề xuất</h3>
      <p>Bác sĩ mạng lưới là đầu mối chuyên môn tại khoa: phát hiện, đánh giá, phản hồi và phối hợp xử lý; không thay thế giám sát chuyên trách KSNK hoặc trách nhiệm quản lý của trưởng khoa.</p>
      <ol>
        <li><b>Hằng ngày — khoảng {{config.dailyMinutes}} phút:</b> trong buồng bệnh, khu thủ thuật và khi xem thông tin lâm sàng theo quyền, rà soát ca nghi nhiễm khuẩn, cách ly, thiết bị xâm lấn, bất thường và nguy cơ tức thời. Ghi sổ bằng phiếu BM-BS01 khi có nội dung cần theo dõi; phối hợp điều dưỡng mạng lưới.</li>
        <li><b>Hằng tuần — khoảng {{config.weeklyMinutes}} phút/lượt:</b> chọn chuyên đề theo nguy cơ của khoa; rà soát hồ sơ, chỉ định và thời gian sử dụng thiết bị, thủ thuật/phẫu thuật và kháng sinh theo phân công; quan sát thực hành, ghi kết quả và bằng chứng trong BM-BS01.</li>
        <li><b>Hằng tháng — mục tiêu minh họa {{config.monthlyWeeklyTarget}} lượt rà soát tuần:</b> tổng hợp BM-BS01, nguy cơ BM-BS02 và tiến độ khắc phục BM-BS03; gửi BC-BS04 cho lãnh đạo khoa và KSNK&amp;PCBT, ngày đề xuất {{config.reportDay}} tháng sau. Mục tiêu điều chỉnh theo đặc thù khoa và nhân lực.</li>
        <li><b>Bất thường nghiêm trọng/nguy cơ cao:</b> báo ngay bằng kênh trực tiếp cho lãnh đạo khoa, KSNK&amp;PCBT và cấp có thẩm quyền theo quy trình; thực hiện xử trí ban đầu trong phạm vi phân công, ghi BM-BS02, phối hợp đánh giá và theo dõi khắc phục. Gửi phiếu không tự động gọi hay gửi thông báo.</li>
      </ol>
      <p><b>Kiểm tra kết quả:</b> đối chiếu phiếu, nội dung và minh chứng; kiểm tra người nhận, tiến độ, kết quả kiểm tra lại và báo cáo tháng. Số lượt hoặc việc nộp báo cáo không tự chứng minh hoàn thành chuyên môn. KSNK xác minh theo kế hoạch; thành viên được đánh giá 6 tháng và hằng năm.</p>
      <p class="muted-small">Căn cứ: Thông tư 16/2018/TT-BYT Điều 19 và Quy chế mạng lưới theo Quyết định 5052, Điều 11, 13–14, 19, 21. Tần suất chi tiết và bảng kiểm là đề xuất demo, không trích dẫn như yêu cầu pháp luật.</p>
      <form *ngIf="canConfigure" (ngSubmit)="saveConfig()">
        <h3>Điều chỉnh chỉ tiêu minh họa</h3>
        <div class="fields">
          <div><label>Phút hằng ngày</label><input type="number" name="dailyMinutes" min="1" max="480" required [(ngModel)]="config.dailyMinutes"></div>
          <div><label>Phút mỗi lượt hằng tuần</label><input type="number" name="weeklyMinutes" min="1" max="480" required [(ngModel)]="config.weeklyMinutes"></div>
          <div><label>Lượt tuần mục tiêu/tháng</label><input type="number" name="monthlyWeeklyTarget" min="1" max="31" required [(ngModel)]="config.monthlyWeeklyTarget"></div>
          <div><label>Ngày đề xuất gửi tháng sau</label><input type="number" name="reportDay" min="1" max="28" required [(ngModel)]="config.reportDay"></div>
        </div><div class="actions"><button class="primary-button compact" [disabled]="saving">Lưu cấu hình demo</button></div>
      </form>
    </section>

    <section *ngIf="view==='observations'">
      <div class="panel block" *ngIf="isDoctor">
        <h3>BM-BS01 · Phiếu giám sát chuyên môn / sổ theo dõi</h3>
        <p class="muted-small">Chọn chuyên đề phù hợp khoa. Đạt = có bằng chứng đáp ứng quy trình được duyệt; Chưa đạt = có tồn tại cụ thể; Không áp dụng hoặc Không đánh giá được phải ghi lý do. Hai trạng thái sau không tính vào mẫu số.</p>
        <form (ngSubmit)="saveObservation()">
          <div class="fields">
            <div><label>Ngày</label><input type="date" name="date" [(ngModel)]="form.date" required></div>
            <div><label>Loại rà soát</label><select name="period" [(ngModel)]="form.period"><option>Hằng ngày</option><option>Hằng tuần</option><option>Đột xuất</option></select></div>
            <div><label>Chuyên đề</label><select name="topic" [(ngModel)]="form.topic" (ngModelChange)="changeTopic()" required><option value="">Chọn chuyên đề</option><option *ngFor="let t of topics" [value]="t.name">{{t.name}}</option></select></div>
            <div><label>Phương pháp</label><select name="method" [(ngModel)]="form.method"><option>Rà soát hồ sơ</option><option>Quan sát trực tiếp</option><option>Phỏng vấn</option><option>Kết hợp</option></select></div>
            <div><label>Vị trí / nhóm đối tượng</label><input name="location" [(ngModel)]="form.location" required></div>
            <div><label>Số hồ sơ / hoạt động rà soát</label><input type="number" name="sampleSize" min="0" step="1" [(ngModel)]="form.sampleSize" required></div>
          </div>
          <div class="criterion" *ngFor="let criterion of form.criteria; let i=index">
            <b>{{i+1}}. {{criterion.label}}</b>
            <div class="fields">
              <div><label>Kết quả</label><select [name]="'result'+i" [(ngModel)]="criterion.result" required><option value="">Chọn kết quả</option><option>Đạt</option><option>Chưa đạt</option><option>Không áp dụng</option><option>Không đánh giá được</option></select></div>
              <div *ngIf="criterion.result==='Chưa đạt'"><label>Tồn tại / minh chứng</label><input [name]="'evidence'+i" [(ngModel)]="criterion.evidence" required></div>
              <div *ngIf="criterion.result==='Không áp dụng' || criterion.result==='Không đánh giá được'"><label>Lý do</label><input [name]="'reason'+i" [(ngModel)]="criterion.reason" required></div>
              <div *ngIf="criterion.result==='Đạt'"><label>Minh chứng tham chiếu</label><input [name]="'evidence'+i" [(ngModel)]="criterion.evidence"></div>
            </div>
          </div>
          <div class="fields">
            <div class="wide"><label>Nhận định và vấn đề cần phối hợp</label><textarea name="summary" [(ngModel)]="form.summary" rows="2"></textarea></div>
            <div class="wide"><label>Xử lý sau giám sát / kế hoạch kiểm tra lại</label><textarea name="followUp" [(ngModel)]="form.followUp" rows="2"></textarea></div>
            <div><label>Người / đơn vị nhận thông tin</label><input name="notifiedTo" [(ngModel)]="form.notifiedTo"></div>
            <div><label>Thời điểm thông báo</label><input type="datetime-local" name="notifiedAt" [(ngModel)]="form.notifiedAt"></div>
          </div>
          <div class="actions"><button class="primary-button compact" [disabled]="saving || !form.criteria.length">Lưu BM-BS01</button></div>
        </form>
      </div>
      <div class="panel block"><h3>Sổ giám sát đã ghi nhận</h3>
        <p *ngIf="!observations.length">Chưa có phiếu trong phạm vi tài khoản.</p>
        <article class="record" *ngFor="let item of observations">
          <b>{{item.code}} · {{item.date}} · {{item.topic}}</b>
          <p>{{item.departmentName}} · {{item.observer}} · {{item.period}} · {{item.method}} · {{item.location}} · {{item.sampleSize}} mẫu</p>
          <ul><li *ngFor="let criterion of item.criteria">{{criterion.label}}: <b>{{criterion.result}}</b><span *ngIf="criterion.evidence"> — {{criterion.evidence}}</span><span *ngIf="criterion.reason"> — {{criterion.reason}}</span></li></ul>
          <p *ngIf="item.summary">Nhận định: {{item.summary}}</p><p *ngIf="item.followUp">Theo dõi: {{item.followUp}}</p>
          <p *ngIf="item.notifiedTo">Thông báo: {{item.notifiedTo}} · {{item.notifiedAt || 'chưa ghi thời điểm'}}</p>
        </article>
      </div>
    </section>

    <section class="panel block" *ngIf="view==='reports'">
      <h3>BC-BS04 · Báo cáo tháng</h3>
      <div class="fields"><div><label>Tháng báo cáo</label><input type="month" [(ngModel)]="month" (ngModelChange)="loadMonth()" [ngModelOptions]="{standalone:true}"></div></div>
      <div *ngIf="isDoctor && summary">
        <div class="statline"><span>{{summary.monitoringCount}} phiếu</span><span>{{summary.weeklyCount}} lượt tuần</span><span>{{summary.sampleSize}} hồ sơ / hoạt động</span><span>{{summary.criteriaMet}}/{{summary.criteriaApplicable}} tiêu chí áp dụng đạt</span><span>{{summary.criteriaNotMet}} chưa đạt · {{summary.criteriaUnknown}} chưa đánh giá được</span><span>{{summary.riskCount}} nguy cơ trong kỳ · {{summary.openRiskCount}} chưa đóng · {{summary.closedRiskCount}} đã đóng</span></div>
        <p class="muted-small">Tính từ phiếu BM-BS01 và nguy cơ của bác sĩ trong tháng; trạng thái nguy cơ tại thời điểm tổng hợp. Không áp dụng và không đánh giá được không nằm trong mẫu số. Đây không phải tỷ lệ NKBV.</p>
        <form (ngSubmit)="submitReport()">
          <div class="fields">
            <div class="wide"><label>Hoạt động và phối hợp nổi bật</label><textarea name="activities" [(ngModel)]="reportForm.activities" rows="2"></textarea></div>
            <div class="wide"><label>Tồn tại, sự cố và việc đang theo dõi</label><textarea name="incidents" [(ngModel)]="reportForm.incidents" rows="2"></textarea></div>
            <div class="wide"><label>Khó khăn / kiến nghị</label><textarea name="recommendations" [(ngModel)]="reportForm.recommendations" rows="2"></textarea></div>
          </div><div class="actions"><button class="primary-button compact" [disabled]="saving">Xác nhận gửi báo cáo</button></div>
        </form>
        <p class="muted-small">Ghi nhận trên demo để lãnh đạo khoa và KSNK xem; không tự động gửi email hoặc thay thế quy trình nộp báo cáo của bệnh viện.</p>
      </div>
      <h3>Báo cáo đã gửi</h3><p *ngIf="!reports.length">Chưa có báo cáo.</p>
      <article class="record" *ngFor="let report of reports"><b>{{report.month}} · {{report.departmentName}} · {{report.submittedBy}} · {{report.status}}</b>
        <p>{{report.summary.monitoringCount}} phiếu · {{report.summary.weeklyCount}} lượt tuần · {{report.summary.criteriaMet}}/{{report.summary.criteriaApplicable}} tiêu chí áp dụng đạt · {{report.summary.riskCount}} nguy cơ</p>
        <p *ngIf="report.activities">Hoạt động: {{report.activities}}</p><p *ngIf="report.incidents">Tồn tại: {{report.incidents}}</p><p *ngIf="report.recommendations">Kiến nghị: {{report.recommendations}}</p>
      </article>
    </section>

    <section class="panel block" *ngIf="view==='tracker' && isKsnk">
      <h3>Bảng theo dõi bác sĩ mạng lưới</h3>
      <div class="fields"><div><label>Tháng theo dõi</label><input type="month" [(ngModel)]="month" (ngModelChange)="loadMonth()" [ngModelOptions]="{standalone:true}"></div></div>
      <p class="muted-small">Tiêu chí demo: đủ {{config.monthlyWeeklyTarget}} lượt tuần, đã gửi báo cáo, có minh chứng, đã theo dõi nguy cơ hoặc xác nhận không phát sinh, và KSNK đã kiểm tra lại. Cần người có thẩm quyền đối chiếu; số liệu không tự chứng minh chất lượng. Đánh giá lưu ảnh chụp tại thời điểm kiểm tra; đánh giá lại khi số liệu thay đổi.</p>
      <div class="scroll"><table><thead><tr><th>BÁC SĨ / KHOA</th><th>PHIẾU</th><th>LƯỢT TUẦN</th><th>NGUY CƠ TRONG KỲ</th><th>CHƯA ĐÓNG</th><th>ĐÃ ĐÓNG</th><th>BÁO CÁO THÁNG</th><th>KIỂM TRA</th></tr></thead>
      <tbody><tr *ngFor="let row of tracker"><td>{{row.fullName}}<small>{{row.employeeCode}} · {{row.departmentName}}</small></td><td>{{row.monitoringCount}}</td><td>{{row.weeklyCount}} / {{config.monthlyWeeklyTarget}}</td><td>{{row.riskCount}}</td><td>{{row.openRiskCount}}</td><td>{{row.closedRiskCount}}</td><td>{{row.reportStatus}}</td><td>{{row.assessment?.status || 'Chưa đánh giá'}}<small *ngIf="row.assessment">{{row.assessment.reviewer}} · {{row.assessment.createdAt | date:'dd/MM/yyyy HH:mm'}}</small><button *ngIf="canConfigure" type="button" class="outline-button" (click)="selectAssessment(row)">Kiểm tra / đánh giá lại</button></td></tr></tbody></table></div>
      <p *ngIf="!tracker.length">Chưa có bác sĩ hoạt động trong danh sách mạng lưới.</p>
      <div class="record" *ngFor="let row of tracker">
        <div *ngIf="row.assessment as a"><b>{{row.fullName}}: {{a.status}}</b>
          <p>Thời điểm đánh giá: {{a.weeklyCount}}/{{a.weeklyTarget}} lượt tuần · Báo cáo: {{a.reportSubmitted ? 'Đã gửi' : 'Chưa gửi'}} · Minh chứng: {{a.hasEvidence ? 'Đạt' : 'Chưa đạt'}} · Theo dõi nguy cơ: {{a.riskFollowed ? 'Đạt / không phát sinh' : 'Chưa đạt'}} · Kiểm tra lại: {{a.verified ? 'Đã kiểm tra' : 'Chưa đạt'}}</p>
          <p>Minh chứng: {{a.evidence}} · Nhận xét: {{a.note}}</p></div>
      </div>
      <form class="record" *ngIf="selectedDoctor && canConfigure" (ngSubmit)="saveAssessment()">
        <h3>Đánh giá {{selectedDoctor.fullName}} · {{month}}</h3>
        <p>Đối chiếu sổ giám sát, báo cáo, nguy cơ và kết quả kiểm tra lại trước khi chọn. Bỏ chọn nếu chưa đáp ứng.</p>
        <p><label><input type="checkbox" name="hasEvidence" [(ngModel)]="assessmentForm.hasEvidence"> Nội dung và minh chứng đầy đủ, phù hợp</label></p>
        <p><label><input type="checkbox" name="riskFollowed" [(ngModel)]="assessmentForm.riskFollowed"> Nguy cơ được theo dõi, hoặc đã xác nhận không phát sinh</label></p>
        <p><label><input type="checkbox" name="verified" [(ngModel)]="assessmentForm.verified"> KSNK đã kiểm tra lại nội dung và minh chứng</label></p>
        <div class="fields"><div class="wide"><label>Mã phiếu / minh chứng đã đối chiếu</label><textarea name="assessmentEvidence" [(ngModel)]="assessmentForm.evidence" required rows="2"></textarea></div>
        <div class="wide"><label>Nhận xét và nội dung cần cải thiện</label><textarea name="assessmentNote" [(ngModel)]="assessmentForm.note" required rows="2"></textarea></div></div>
        <div class="actions"><button type="submit" class="primary-button compact" [disabled]="saving">Lưu kết quả kiểm tra</button><button type="button" class="outline-button" (click)="selectedDoctor=null">Hủy</button></div>
      </form>
    </section>
  `
})
export class DoctorWorkspaceComponent implements OnInit {
  readonly user: User | null = this.api.user;
  readonly isDoctor = this.user?.roles.includes('MEMBER_DOCTOR') ?? false;
  readonly isKsnk = this.user?.roles.some(role => ['KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY', 'NETWORK_SECRETARY'].includes(role)) ?? false;
  readonly canConfigure = this.user?.roles.some(role => ['KSNK_ADMIN', 'NETWORK_LEAD', 'NETWORK_DEPUTY'].includes(role)) ?? false;
  readonly topics = [
    { name: 'Nhiễm khuẩn bệnh viện / ca nghi ngờ', criteria: ['Rà soát dấu hiệu và yếu tố nguy cơ theo phân công', 'Ca nghi ngờ được thông báo và phối hợp xác minh theo quy trình', 'Các biện pháp phòng ngừa và theo dõi được ghi nhận'] },
    { name: 'Thiết bị xâm lấn', criteria: ['Chỉ định và nhu cầu tiếp tục sử dụng được rà soát', 'Thực hành đặt, chăm sóc và theo dõi phù hợp quy trình tại khoa', 'Dấu hiệu bất thường được báo và theo dõi'] },
    { name: 'Phẫu thuật / nhiễm khuẩn vết mổ', criteria: ['Hồ sơ và yếu tố nguy cơ được rà soát theo phân công', 'Các biện pháp vô khuẩn và phòng ngừa được ghi nhận', 'Dấu hiệu nghi nhiễm khuẩn và xử lý được báo cáo'] },
    { name: 'Kháng sinh dự phòng', criteria: ['Chỉ định và thời điểm dùng được rà soát theo hướng dẫn được duyệt', 'Liều, đường dùng và thời gian sử dụng được rà soát theo phân công', 'Sai lệch hoặc vấn đề cần phối hợp được phản hồi'] },
    { name: 'Sử dụng kháng sinh', criteria: ['Chỉ định và diễn biến điều trị được rà soát theo phân công', 'Kết quả vi sinh / kháng sinh đồ được xem xét khi có chỉ định', 'Vấn đề cần điều chỉnh được chuyển bác sĩ điều trị hoặc bộ phận phụ trách'] },
    { name: 'Lây truyền / bệnh truyền nhiễm / vi sinh đa kháng', criteria: ['Nguy cơ lây truyền và thông tin cảnh báo được rà soát', 'Biện pháp phòng ngừa và cách ly phù hợp quy trình được kiểm tra', 'Bất thường được thông báo và theo dõi cùng KSNK'] }
  ];
  tabs: { key: string; label: string }[] = [];
  view = 'plan';
  config: Config = { dailyMinutes: 15, weeklyMinutes: 30, monthlyWeeklyTarget: 4, reportDay: 5 };
  observations: Observation[] = [];
  reports: Report[] = [];
  tracker: TrackerRow[] = [];
  selectedDoctor: TrackerRow | null = null;
  assessmentForm = { hasEvidence: false, riskFollowed: false, verified: false, evidence: '', note: '' };
  summary: Summary | null = null;
  month = this.localDate().slice(0, 7);
  form = this.newForm();
  reportForm = { activities: '', incidents: '', recommendations: '' };
  saving = false;
  error = '';
  success = '';

  constructor(private api: ApiService, private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.tabs = [{ key: 'plan', label: 'Nhiệm vụ & lịch' }, { key: 'observations', label: 'BM-BS01 · Sổ giám sát' }, { key: 'reports', label: 'BC-BS04 · Báo cáo tháng' }];
    if (this.isKsnk) this.tabs.push({ key: 'tracker', label: 'Bảng theo dõi' });
    this.api.get<{ config: Config }>('/doctor/config').subscribe({ next: r => this.config = r.config, error: e => this.fail(e, 'Không tải được cấu hình.') });
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && this.tabs.some(item => item.key === tab)) this.selectTab(tab);
  }
  localDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  newForm() {
    return { date: this.localDate(), period: 'Hằng tuần', topic: '', method: 'Rà soát hồ sơ', location: '', sampleSize: 0, criteria: [] as Criterion[], summary: '', followUp: '', notifiedTo: '', notifiedAt: '' };
  }
  selectTab(tab: string): void {
    this.view = tab; this.error = ''; this.success = ''; this.selectedDoctor = null;
    if (tab === 'observations') this.loadObservations();
    if (tab === 'reports' || tab === 'tracker') this.loadMonth();
  }
  changeTopic(): void {
    const topic = this.topics.find(item => item.name === this.form.topic);
    this.form.criteria = (topic?.criteria ?? []).map(label => ({ label, result: '', evidence: '', reason: '' }));
  }
  loadObservations(): void {
    this.api.get<{ items: Observation[] }>('/doctor/observations').subscribe({ next: r => this.observations = r.items, error: e => this.fail(e, 'Không tải được sổ giám sát.') });
  }
  loadMonth(): void {
    this.error = ''; this.summary = null; this.reports = []; this.tracker = []; this.selectedDoctor = null;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.month)) return;
    const month = encodeURIComponent(this.month);
    if (this.view === 'tracker' && this.isKsnk) {
      this.api.get<{ items: TrackerRow[] }>(`/doctor/tracker?month=${month}`).subscribe({ next: r => this.tracker = r.items, error: e => this.fail(e, 'Không tải được bảng theo dõi.') });
    }
    if (this.view === 'reports') {
      this.api.get<{ items: Report[] }>('/doctor/reports').subscribe({ next: r => this.reports = r.items.filter(item => item.month === this.month), error: e => this.fail(e, 'Không tải được báo cáo.') });
      if (this.isDoctor) this.api.get<{ summary: Summary }>(`/doctor/summary?month=${month}`).subscribe({ next: r => this.summary = r.summary, error: e => this.fail(e, 'Không tổng hợp được chỉ số.') });
    }
  }
  saveConfig(): void {
    this.saving = true; this.error = ''; this.success = '';
    this.api.put<{ config: Config }>('/doctor/config', this.config).subscribe({ next: r => { this.config = r.config; this.saving = false; this.success = 'Đã lưu cấu hình minh họa.'; }, error: e => { this.saving = false; this.fail(e, 'Không lưu được cấu hình.'); } });
  }
  saveObservation(): void {
    this.saving = true; this.error = ''; this.success = '';
    this.api.post<{ item: Observation }>('/doctor/observations', this.form).subscribe({ next: () => { this.form = this.newForm(); this.saving = false; this.success = 'Đã lưu phiếu BM-BS01.'; this.loadObservations(); }, error: e => { this.saving = false; this.fail(e, 'Không lưu được phiếu.'); } });
  }
  submitReport(): void {
    this.saving = true; this.error = ''; this.success = '';
    this.api.post<{ item: Report }>('/doctor/reports', { month: this.month, ...this.reportForm }).subscribe({ next: () => { this.saving = false; this.reportForm = { activities: '', incidents: '', recommendations: '' }; this.loadMonth(); this.success = 'Đã ghi nhận báo cáo tháng.'; }, error: e => { this.saving = false; this.fail(e, 'Không gửi được báo cáo.'); } });
  }
  selectAssessment(row: TrackerRow): void {
    this.selectedDoctor = row;
    this.assessmentForm = { hasEvidence: false, riskFollowed: false, verified: false, evidence: '', note: '' };
  }
  saveAssessment(): void {
    if (!this.selectedDoctor) return;
    this.saving = true; this.error = ''; this.success = '';
    const body = { month: this.month, employeeCode: this.selectedDoctor.employeeCode, departmentCode: this.selectedDoctor.departmentCode, ...this.assessmentForm };
    this.api.post<{ item: Assessment }>('/doctor/assessments', body).subscribe({
      next: () => { this.saving = false; this.loadMonth(); this.success = 'Đã lưu kết quả kiểm tra theo tiêu chí demo.'; },
      error: e => { this.saving = false; this.fail(e, 'Không lưu được kết quả kiểm tra.'); }
    });
  }
  fail(error: { error?: { message?: string } }, fallback: string): void { this.error = error?.error?.message || fallback; }
}
