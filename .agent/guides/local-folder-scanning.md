# Local Folder Scanning Guide

## ✅ Tính năng đã hoàn thành

Bạn đã có thể scan local folder trên máy tính của mình!

## 🚀 Cách sử dụng

### 1. Truy cập trang Scan
Mở: http://localhost:3000/scan

### 2. Chọn "Local Folder"
Click vào card **Local Folder** (giữa Git Repository và Upload Archive)

### 3. Nhập đường dẫn folder
Ví dụ:
- Windows: `E:\Code\MyProject` hoặc `C:\Users\YourName\Projects\myapp`
- Linux/Mac: `/home/user/projects/myapp`

### 4. Cấu hình (tùy chọn)
- **Target Language**: Auto-detect hoặc chọn ngôn ngữ cụ thể
- **Rule Set**: Standard, Security, Compliance, etc.

### 5. Click "Launch Analysis"
Scan sẽ bắt đầu và hiển thị progress

## 📋 Requirements

### Folder phải:
- ✅ Tồn tại trên máy
- ✅ Có quyền đọc
- ✅ Chứa code (JavaScript, TypeScript, Python, Java, Go, etc.)

### Đường dẫn:
- ✅ Sử dụng absolute path (đường dẫn tuyệt đối)
- ✅ Format: `E:\Code\MyProject` (Windows)
- ❌ Tránh: relative path như `.\myproject`

## 🔧 Backend đã implement

### API Endpoint: `/api/scan`
```typescript
POST /api/scan
{
  "method": "folder",
  "folderPath": "E:\\Code\\MyProject"
}
```

### Features:
- ✅ Path validation (kiểm tra folder có tồn tại)
- ✅ Directory check (đảm bảo là folder, không phải file)
- ✅ Real Semgrep scanning với downloaded rules
- ✅ Error handling với messages rõ ràng
- ✅ Max duration: 5 phút cho large projects

### Error Handling:
- ❌ Path không tồn tại → `Invalid folder path`
- ❌ Path là file, không phải folder → `The provided path is not a directory`
- ❌ Không có quyền truy cập → `Cannot access folder: Permission denied`

## 🎯 Example Scan Flow

1. User nhập: `E:\Code\SCA`
2. Backend validates path exists
3. Backend checks it's a directory
4. Resolves absolute path
5. Runs Semgrep scan
6. Returns findings
7. UI displays results

## 📊 Kết quả

Sau khi scan xong, bạn sẽ thấy:
- **Total findings**: Số lỗi tìm thấy
- **Severity breakdown**: Critical, High, Medium, Low, Info
- **File locations**: Đường dẫn file và line number
- **Code snippets**: Đoạn code vi phạm
- **Remediation suggestions**: Cách sửa

## 💡 Tips

### Scan nhanh hơn:
- Scan folder nhỏ trước (< 100 files)
- Loại trừ `node_modules`, `vendor`, `.git`
- Chọn specific language thay vì auto-detect

### Best practices:
- ✅ Scan từng module/package riêng
- ✅ Dùng specific rule sets cho language của bạn
- ✅ Review findings và mark false positives
- ✅ Export PDF report để share với team

## 🐛 Troubleshooting

### "Invalid folder path"
→ Kiểm tra đường dẫn có đúng không, folder có tồn tại không

### "Cannot access folder"
→ Kiểm tra quyền đọc folder

### Scan quá lâu
→ Folder quá lớn, thử scan folder nhỏ hơn

### Không tìm thấy lỗi nào
→ Code của bạn sạch, hoặc chưa download đúng rule pack cho ngôn ngữ

## 📝 Next Steps

Sau khi scan xong:
1. View chi tiết findings trong results page
2. Mark false positives
3. Fix vulnerabilities
4. Re-scan để verify fixes
5. Export report

Enjoy scanning! 🚀
