# Unified Topics File - Migration Guide

## Thay Đổi

### Trước Đây (2 files riêng biệt)

```
.sca-data/
├── telegram-topics.json          # Project → Topic ID mapping
└── telegram-topics-cache.json    # Topic info cache (name, chatId, etc.)
```

### Bây Giờ (1 file hợp nhất)

```
.sca-data/
└── telegram-topics.json          # Unified: mappings + cache
```

## Cấu Trúc File Mới

### Format Mới

```json
{
  "mappings": {
    "MyProject": 123,
    "AnotherProject": 456
  },
  "topics": {
    "-1001234567_123": {
      "threadId": 123,
      "name": "MyProject",
      "chatId": "-1001234567",
      "projectName": "MyProject",
      "lastUpdated": 1704520800000
    },
    "-1001234567_789": {
      "threadId": 789,
      "name": "Upload file ở đây",
      "chatId": "-1001234567",
      "lastUpdated": 1704520800000
    }
  }
}
```

### Format Cũ (Vẫn tương thích)

```json
{
  "MyProject": 123,
  "AnotherProject": 456
}
```

**Lưu ý:** Code tự động migrate format cũ sang mới khi đọc file.

## API Changes

### topic-manager.ts

#### Functions Mới

```typescript
// Save project mapping
saveProjectMapping(projectName: string, threadId: number): Promise<void>

// Get project mapping
getProjectMapping(projectName: string): Promise<number | null>

// Delete both mapping and cache
deleteTopicInfo(projectName?: string, chatId?: string | number, threadId?: number): Promise<void>

// Cache with optional projectName
cacheTopicInfo(chatId, threadId, name, projectName?): Promise<void>
```

#### Functions Giữ Nguyên

```typescript
getCachedTopicName(chatId, threadId): Promise<string | null>
isUploadAllowedInTopic(topicName): boolean
getAllowedUploadTopics(): string[]
cleanupOldCache(): Promise<void>
```

### telegram.ts

#### Updated Functions

- `saveTopicMapping()` - Bây giờ gọi `topic-manager.saveProjectMapping()`
- `deleteForumTopic()` - Bây giờ gọi `topic-manager.deleteTopicInfo()`
- `getOrCreateForumTopic()` - Cache cả projectName

## Migration

### Tự Động

Code tự động detect và migrate format cũ:

```typescript
// Trong loadTopicsData()
if (!parsed.mappings && !parsed.topics) {
    return {
        mappings: parsed,  // Coi toàn bộ file là mappings
        topics: {}
    };
}
```

### Thủ Công (Nếu cần)

Nếu bạn có file cũ và muốn migrate thủ công:

```javascript
// Old file
{
  "Project1": 123,
  "Project2": 456
}

// Convert to new format
{
  "mappings": {
    "Project1": 123,
    "Project2": 456
  },
  "topics": {}
}
```

## Lợi Ích

### ✅ Đơn Giản Hóa

- **1 file** thay vì 2 files
- **1 nguồn sự thật** cho topic data
- Dễ backup và restore

### ✅ Hiệu Suất

- Ít I/O operations hơn
- Atomic updates (cập nhật cả mapping và cache cùng lúc)

### ✅ Consistency

- Không lo đồng bộ giữa 2 files
- Mapping và cache luôn khớp nhau

### ✅ Flexibility

- Có thể thêm metadata khác trong tương lai
- Dễ mở rộng structure

## Backward Compatibility

✅ **Hoàn toàn tương thích ngược**

- File cũ vẫn đọc được
- Tự động upgrade sang format mới khi save
- Không cần chạy migration script

## Testing

### Kiểm Tra Migration

```bash
# 1. Backup file cũ (nếu có)
cp .sca-data/telegram-topics.json .sca-data/telegram-topics.json.backup

# 2. Test với format cũ
echo '{"TestProject": 999}' > .sca-data/telegram-topics.json

# 3. Chạy app - file sẽ tự động migrate
npm run dev

# 4. Kiểm tra file đã migrate
cat .sca-data/telegram-topics.json
```

Kết quả mong đợi:
```json
{
  "mappings": {
    "TestProject": 999
  },
  "topics": {}
}
```

## File Location

**Duy nhất:** `.sca-data/telegram-topics.json`

**Không còn:** `.sca-data/telegram-topics-cache.json` ❌

## Summary

| Aspect | Trước | Sau |
|--------|-------|-----|
| Files | 2 files | 1 file |
| Complexity | Medium | Low |
| Sync Issues | Possible | None |
| Performance | Good | Better |
| Backward Compat | N/A | ✅ Yes |

---

**Kết luận:** Migration hoàn toàn trong suốt và không cần can thiệp thủ công!
