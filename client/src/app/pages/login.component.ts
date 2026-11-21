import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../core/api.service';

type LoginEntry = 'doctor' | 'ksnk-main' | 'member' | 'head' | 'ksnk';

@Component({
  standalone: true, imports: [CommonModule, FormsModule, RouterLink],
  template: `
  <div class="login-shell"><div class="login-side"><a class="brand brand-light" routerLink="/"><img src="assets/Logo.png" alt="Logo Bệnh viện Đa khoa Hùng Vương" style="width:54px;height:54px;object-fit:contain"><span><b>KSNK</b><small>MẠNG LƯỚI KIỂM SOÁT NHIỄM KHUẨN</small></span></a><div class="login-side-content"><span class="eyebrow light-eyebrow">HỆ THỐNG QUẢN LÝ NỘI BỘ</span><h1>Chung một<br><em>mạng lưới.</em><br>Chung mục tiêu<br>an toàn.</h1><p>Kết nối hoạt động giám sát, phối hợp xử lý nguy cơ và cải tiến chất lượng kiểm soát nhiễm khuẩn.</p></div><div class="login-side-bottom">BỆNH VIỆN ĐA KHOA HÙNG VƯƠNG <span>·</span> KSNK-PCBT<br><small>Đề xuất: Nguyễn Mạnh Hiếu · Triển khai: Nguyễn Hoàng Dũng</small></div></div>
  <div class="login-main"><div class="login-box"><a class="back-link" routerLink="/">← Quay lại trang chủ</a><div class="login-badge">{{portalLabel}}</div><h2>Đăng nhập</h2><p class="muted">Nhập tài khoản và mật khẩu demo; có thể chọn tên tài khoản gợi ý bên dưới.</p><form (ngSubmit)="submit()"><label for="login-username">Tài khoản demo</label><div class="input-wrap"><span>♙</span><input id="login-username" name="username" [(ngModel)]="username" autocomplete="username" placeholder="Nhập tài khoản demo" required></div><label for="login-password">Mật khẩu</label><div class="input-wrap"><span>⌑</span><input id="login-password" name="password" [(ngModel)]="password" [type]="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="Nhập mật khẩu" required><button type="button" class="show-pass" (click)="showPassword=!showPassword">{{showPassword?'Ẩn':'Hiện'}}</button></div><div class="error-message" *ngIf="error" role="alert">{{error}}</div><button class="primary-button login-button" [disabled]="loading">{{loading?'ĐANG XÁC THỰC...':'ĐĂNG NHẬP HỆ THỐNG'}} <span>→</span></button></form><div class="demo-credentials"><div class="demo-title"><span>✦</span> TÀI KHOẢN DÙNG THỬ</div><p *ngFor="let item of credentials"><b>{{item.label}}</b><button type="button" (click)="fill(item.user)">{{item.user}} <span>↗</span></button></p><small>Mật khẩu dùng thử: <b>Demo&#64;123</b></small></div><div class="login-security">▣ Đây là bản demo. Không nhập tài khoản hoặc mật khẩu HIS thật.</div></div></div></div>`
})
export class LoginComponent {
  username = ''; password = ''; error = ''; loading = false; showPassword = false; entry: LoginEntry = 'member';
  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const entry = params.get('portal');
      if (entry !== 'doctor' && entry !== 'ksnk-main' && entry !== 'member' && entry !== 'head' && entry !== 'ksnk') {
        void this.router.navigate(['/']);
        return;
      }
      this.entry = entry;
      this.username = ''; this.password = ''; this.error = ''; this.showPassword = false;
    });
  }
  get portal(): string { return this.entry === 'doctor' ? 'member' : this.entry === 'ksnk-main' ? 'ksnk' : this.entry; }
  get portalLabel(): string { return this.entry === 'doctor' ? 'BÁC SĨ MẠNG LƯỚI' : this.portal === 'member' ? 'THÀNH VIÊN MẠNG LƯỚI' : this.portal === 'head' ? 'TRƯỞNG KHOA' : 'KHOA KSNK-PCBT'; }
  get credentials(): { label: string; user: string }[] {
    const doctor = { label: 'Bác sĩ mạng lưới', user: 'bs.nguyen' };
    const admin = { label: 'Khoa KSNK-PCBT', user: 'ksnk.admin' };
    if (this.entry === 'doctor') return [doctor];
    if (this.entry === 'ksnk-main') return [admin];
    if (this.entry === 'member') return [doctor, { label: 'Điều dưỡng mạng lưới', user: 'dd.tran' }];
    if (this.entry === 'head') return [{ label: 'Trưởng khoa', user: 'truongkhoa.noi' }];
    return [admin, { label: 'Thư ký mạng lưới', user: 'thuky.ksnk' }];
  }
  fill(user: string): void { this.username = user; this.password = ''; this.error = ''; }
  submit(): void {
    this.error = ''; this.loading = true;
    this.api.login(this.username, this.password, this.portal, this.entry === 'doctor' ? 'MEMBER_DOCTOR' : undefined).subscribe({ next: () => { void this.router.navigate(['/app/dashboard']); }, error: err => { this.error = err?.error?.message || 'Không thể đăng nhập. Vui lòng thử lại.'; this.loading = false; }, complete: () => this.loading = false });
  }
}
