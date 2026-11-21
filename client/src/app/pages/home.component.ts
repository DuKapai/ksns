import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true, imports: [RouterLink],
  styles: [`
    .portal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .portal-card { text-align: left; font: inherit; cursor: pointer; }
    .portal-card:focus-visible, summary:focus-visible { outline: 3px solid #247b68; outline-offset: 3px; }
    .advanced { margin-top: 20px; color: #355b54; font-size: 13px; }
    .advanced summary { cursor: pointer; font-weight: 700; }
    .advanced-links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
    .advanced-links a { color: #176f5d; text-decoration: underline; }
    @media (max-width: 700px) { .portal-grid { grid-template-columns: 1fr; } }
  `],
  template: `
  <div class="landing-shell">
    <header class="landing-nav"><a class="brand" routerLink="/"><img src="assets/Logo.png" alt="Logo Bệnh viện Đa khoa Hùng Vương" style="width:48px;height:48px;object-fit:contain"><span><b>KSNK</b><small>MẠNG LƯỚI KIỂM SOÁT NHIỄM KHUẨN</small></span></a><div class="nav-right"><span class="live-dot"></span> BẢN DEMO NGHIỆP VỤ <span class="nav-divider"></span><span>HỆ THỐNG QUẢN LÝ NỘI BỘ</span></div></header>
    <main class="landing-main">
      <section class="hero-copy"><div class="eyebrow"><span></span> HỆ THỐNG QUẢN LÝ MẠNG LƯỚI</div><h1>Kiểm soát hôm nay.<br><em>An toàn ngày mai.</em></h1><p>Chọn vai trò để xem cách ghi nhận tại khoa hoặc theo dõi hoạt động của mạng lưới.</p><div class="hero-meta"><div><b>02</b><span>Vai trò chính</span></div><div><b>01</b><span>Quy trình phối hợp</span></div></div></section>
      <section class="portal-section"><div class="section-heading"><div><span class="eyebrow">BẮT ĐẦU DEMO</span><h2>Chọn vai trò bạn muốn trải nghiệm</h2><p>Chọn vai trò, sau đó đăng nhập bằng tài khoản demo.</p></div></div>
        <div class="portal-grid">
          <a class="portal-card" routerLink="/login/doctor"><div class="portal-top"><span class="portal-icon icon-blue">♧</span><span class="portal-arrow">↗</span></div><div class="portal-index">01 / TẠI KHOA</div><h3>Bác sĩ mạng lưới</h3><p>Ghi giám sát trong ngày, báo nguy cơ và gửi báo cáo tháng của khoa mình.</p><div class="portal-footer"><span>Góc nhìn của bác sĩ tại khoa</span><b>Đăng nhập <i>→</i></b></div></a>
          <a class="portal-card" routerLink="/login/ksnk-main"><div class="portal-top"><span class="portal-icon icon-green">✚</span><span class="portal-arrow">↗</span></div><div class="portal-index">02 / TOÀN MẠNG LƯỚI</div><h3>Khoa KSNK-PCBT</h3><p>Theo dõi các khoa, kiểm tra nguy cơ và xem tiến độ, báo cáo của bác sĩ.</p><div class="portal-footer"><span>Góc nhìn điều phối và kiểm tra lại</span><b>Đăng nhập <i>→</i></b></div></a>
        </div>
        <details class="advanced"><summary>Tài khoản demo khác</summary><p>Dành cho trải nghiệm điều dưỡng, trưởng khoa hoặc thư ký.</p><div class="advanced-links"><a routerLink="/login/member">Thành viên mạng lưới</a><a routerLink="/login/head">Trưởng khoa</a><a routerLink="/login/ksnk">Khoa KSNK-PCBT</a></div></details>
      </section>
      <section class="landing-note"><span class="note-icon">ⓘ</span><div><b>Chỉ dùng dữ liệu mô phỏng</b><p>Hai vai trò dùng tài khoản demo khác nhau để minh họa phối hợp, không phải phân quyền bảo mật thực tế.</p></div><span class="note-tag">DEMO</span></section>
    </main>
    <footer class="landing-footer"><span>© 2026 · Mạng lưới Kiểm soát nhiễm khuẩn</span><span>Đề xuất: Nguyễn Mạnh Hiếu · Triển khai: Nguyễn Hoàng Dũng</span></footer>
  </div>`
})
export class HomeComponent { }
