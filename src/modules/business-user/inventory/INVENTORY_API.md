// src/modules/business-user/inventory/INVENTORY_API.md

# Inventory API Documentation

## Overview

The Inventory API allows business owners to manage their product inventory, including tracking stock levels and setting minimum/maximum thresholds.

## Base URL
```
/business/inventory
```

## Endpoints

### 1. Get All Inventory Items
**GET** `/business/inventory`

Returns all inventory items for the authenticated business owner.

**Authentication:** Required (JWT Bearer Token)

**Response:**
```json
[
  {
    "id": "inv-123",
    "productId": "prod-456",
    "productName": "Product Name",
    "category": "Electronics",
    "currentStock": 45,
    "minStock": 10,
    "maxStock": 100,
    "price": 29.99,
    "sku": "SKU-123",
    "imageUrl": "https://...",
    "lastRestockedAt": "2026-06-18T10:30:00Z",
    "createdAt": "2026-06-17T08:00:00Z"
  }
]
```

---

### 2. Update Stock Quantity
**PATCH** `/business/inventory/:id/stock`

Update the current stock quantity for an inventory item.

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (string): The inventory item ID

**Request Body:**
```json
{
  "stock": 50
}
```

**Response:**
Same as Get All Inventory Items (single item).

**Example:**
```bash
curl -X PATCH \
  https://api.example.com/business/inventory/inv-123/stock \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stock": 50}'
```

---

### 3. Update Stock Levels (Min/Max)
**PATCH** `/business/inventory/:id/levels`

Update the minimum and maximum stock thresholds for an inventory item.

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (string): The inventory item ID

**Request Body:**
```json
{
  "minStock": 5,
  "maxStock": 200
}
```

**Response:**
Same as Get All Inventory Items (single item).

**Example:**
```bash
curl -X PATCH \
  https://api.example.com/business/inventory/inv-123/levels \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"minStock": 5, "maxStock": 200}'
```

---

## Error Handling

All endpoints return standard HTTP status codes:

| Status | Description |
|--------|-------------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

**Error Response Format:**
```json
{
  "statusCode": 404,
  "message": "Inventory item not found.",
  "error": "Not Found"
}
```

---

## Notes

- **Inventory Creation**: Inventory records are automatically created when a product is created by a business owner.
- **Stock Synchronization**: Updating inventory stock also updates the Product's stock field.
- **Last Restocked**: The `lastRestockedAt` timestamp is automatically updated whenever stock is modified.
- **Business Ownership**: Users can only access and modify inventory for businesses they own.
