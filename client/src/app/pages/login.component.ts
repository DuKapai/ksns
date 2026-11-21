import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';

@Component({
  standalone: true, imports: [CommonModule, FormsModule, RouterLink],
  template: `
  <div class="login-shell"><div class="login-side"><a class="brand brand-light" routerLink="/"><img src="assets/Logo.png" alt="Logo Bệnh viện Đa khoa Hùng Vương" style="width:54px;height:54px;object-fit:contain"><span><b>KSNK</b><small>MẠNG LƯỚI KIỂM SOÁT NHIỄM KHUẨN</small></span></a><div class="login-side-content"><span class="eyebrow light-eyebrow">HỆ THỐNG QUẢN LÝ NỘI BỘ</span><h1>Chung một<br><em>mạng lưới.</em><br>Chung mục tiêu<br>an toàn.</h1><p>Kết nối hoạt động giám sát, phối hợp xử lý nguy cơ và cải tiến chất lượng kiểm soát nhiễm khuẩn.</p></div><div class="login-side-bottom">BỆNH VIỆN ĐA KHOA HÙNG VƯƠNG <span>·</span> KSNK-PCBT<br><small>Đề xuất: Nguyễn Mạnh Hiếu · Triển khai: Nguyễn Hoàng Dũng</small></div></div>
  <div class="login-main"><div class="login-box"><a class="back-link" routerLink="/">← Quay lại trang chủ</a><div class="login-badge">{{portalLabel}}</div><h2>Đăng nhập</h2><p class="muted">Chọn tài khoản dùng thử bên dưới để bắt đầu.</p><form (ngSubmit)="submit()"><label>Tài khoản demo</label><div class="input-wrap"><span>♙</span><input name="username" [(ngModel)]="username" autocomplete="username" placeholder="Nhập tài khoản demo" required></div><label>Mật khẩu</label><div class="input-wrap"><span>⌑</span><input name="password" [(ngModel)]="password" [type]="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Nhập mật khẩu" required><button type="button" class="show-pass" (click)="showPassword=!showPassword">{{showPassword?'Ẩn':'Hiện'}}</button></div><div class="error-message" *ngIf="error">{{error}}</div><button class="primary-button login-button" [disabled]="loading">{{loading?'ĐANG XÁC THỰC...':'ĐĂNG NHẬP HỆ THỐNG'}} <span>→</span></button></form><div class="demo-credentials"><div class="demo-title"><span>✦</span> TÀI KHOẢN DÙNG THỬ</div><p *ngFor="let item of credentials"><b>{{item.label}}</b><button type="button" (click)="fill(item.user)">{{item.user}} <span>↗</span></button></p><small>Mật khẩu dùng thử: <b>Demo&#64;123</b></small></div><div class="login-security">▣ Đây là bản demo. Không nhập tài khoản hoặc mật khẩu HIS thật.</div></div></div></div>`
})
export class LoginComponent {
  username = ''; password = ''; error = ''; loading = false; showPassword = false; portal = 'member';
  credentials: { label: string; user: string }[] = [];
  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {
    this.portal = this.route.snapshot.paramMap.get('portal') || 'member';
    this.credentials = this.portal === 'member' ? [{ label: 'Bác sĩ mạng lưới', user: 'bs.nguyen' }, { label: 'Điều dưỡng mạng lưới', user: 'dd.tran' }] : this.portal === 'head' ? [{ label: 'Trưởng khoa', user: 'truongkhoa.noi' }] : [{ label: 'Khoa KSNK-PCBT', user: 'ksnk.admin' }, { label: 'Thư ký mạng lưới', user: 'thuky.ksnk' }];
  }
  get portalLabel(): string { return this.portal === 'member' ? 'THÀNH VIÊN MẠNG LƯỚI' : this.portal === 'head' ? 'TRƯỞNG KHOA' : 'KHOA KSNK-PCBT'; }
  fill(user: string): void { this.username = user; this.password = 'Demo@123'; }
  submit(): void {
    this.error = ''; this.loading = true;
    this.api.login(this.username, this.password, this.portal).subscribe({ next: result => { this.router.navigate(['/app/dashboard']); }, error: err => { this.error = err?.error?.message || 'Không thể đăng nhập. Vui lòng thử lại.'; this.loading = false; }, complete: () => this.loading = false });
  }
}
