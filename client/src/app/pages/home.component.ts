import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true, imports: [RouterLink],
  template: `
  <div class="landing-shell">
    <header class="landing-nav"><a class="brand" routerLink="/"><img src="assets/Logo.png" alt="Logo Bệnh viện Đa khoa Hùng Vương" style="width:48px;height:48px;object-fit:contain"><span><b>KSNK</b><small>MẠNG LƯỚI KIỂM SOÁT NHIỄM KHUẨN</small></span></a><div class="nav-right"><span class="live-dot"></span> BẢN DEMO NGHIỆP VỤ <span class="nav-divider"></span><span>HỆ THỐNG QUẢN LÝ NỘI BỘ</span></div></header>
    <main class="landing-main">
      <section class="hero-copy"><div class="eyebrow"><span></span> HỆ THỐNG QUẢN LÝ MẠNG LƯỚI</div><h1>Kiểm soát hôm nay.<br><em>An toàn ngày mai.</em></h1><p>Nền tảng phối hợp, giám sát và cải tiến hoạt động kiểm soát nhiễm khuẩn trên toàn bệnh viện.</p><div class="hero-meta"><div><b>03</b><span>Phân hệ nghiệp vụ</span></div><div><b>01</b><span>Đầu mối chuyên môn</span></div><div><b>360°</b><span>Theo dõi hoạt động</span></div></div></section>
      <section class="portal-section"><div class="section-heading"><div><span class="eyebrow">CHỌN KHÔNG GIAN LÀM VIỆC</span><h2>Truy cập hệ thống</h2></div><span class="step-label">01 <i>/</i> 03</span></div>
        <div class="portal-grid">
          <a class="portal-card" routerLink="/login/member"><div class="portal-top"><span class="portal-icon icon-blue">♧</span><span class="portal-arrow">↗</span></div><div class="portal-index">01 / FIELD NETWORK</div><h3>Thành viên mạng lưới</h3><p>Thực hiện nhiệm vụ tại khoa, ghi nhận giám sát, phản ánh nguy cơ và gửi báo cáo định kỳ.</p><div class="portal-footer"><span>Bác sĩ · Điều dưỡng · Hộ sinh · Kỹ thuật y</span><b>Vào phân hệ <i>→</i></b></div></a>
          <a class="portal-card" routerLink="/login/head"><div class="portal-top"><span class="portal-icon icon-amber">▤</span><span class="portal-arrow">↗</span></div><div class="portal-index">02 / DEPARTMENT</div><h3>Trưởng khoa</h3><p>Theo dõi hoạt động KSNK tại đơn vị, tiếp nhận tồn tại và phối hợp tổ chức khắc phục.</p><div class="portal-footer"><span>Quản lý và điều hành tại khoa</span><b>Vào phân hệ <i>→</i></b></div></a>
          <a class="portal-card" routerLink="/login/ksnk"><div class="portal-top"><span class="portal-icon icon-green">✚</span><span class="portal-arrow">↗</span></div><div class="portal-index">03 / KSNK CONTROL</div><h3>Khoa KSNK-PCBT</h3><p>Điều phối mạng lưới, hướng dẫn chuyên môn, kiểm tra lại và tổng hợp báo cáo toàn viện.</p><div class="portal-footer"><span>Đầu mối chuyên môn toàn viện</span><b>Vào phân hệ <i>→</i></b></div></a>
        </div>
      </section>
      <section class="landing-note"><span class="note-icon">ⓘ</span><div><b>Phân hệ theo tài khoản demo</b><p>Việc chọn phân hệ chỉ xác định khu vực đăng nhập. Vai trò và phạm vi khoa được mô phỏng để giới thiệu nghiệp vụ.</p></div><span class="note-tag">DEMO</span></section>
    </main>
    <footer class="landing-footer"><span>© 2026 · Mạng lưới Kiểm soát nhiễm khuẩn</span><span>Đề xuất: Nguyễn Mạnh Hiếu · Triển khai: Nguyễn Hoàng Dũng</span></footer>
  </div>`
})
export class HomeComponent { }
