# Google Sheets Integration

This project includes a frontend `Add to Sheets` button and a server-side proxy route at `/api/integrations/google-sheets`.

Set this environment variable so the web app can forward requests to your Apps Script web app:

```bash
GOOGLE_SHEETS_WEB_APP_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

## Google Apps Script

Use this code in your Apps Script project. It accepts JSON, appends a row in the order `[timestamp, platform, content, imageUrl]`, and returns a JSON success response.

```javascript
const SHEET_NAME = 'Posts';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const timestamp = payload.timestamp;
    const platform = payload.platform;
    const content = payload.content;
    const imageUrl = payload.imageUrl || '';

    if (!timestamp || !platform || !content) {
      return jsonResponse({
        status: 'error',
        message: 'timestamp, platform, and content are required',
      });
    }

    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME) ||
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

    sheet.appendRow([timestamp, platform, content, imageUrl]);

    return jsonResponse({
      status: 'success',
      row: [timestamp, platform, content, imageUrl],
    });
  } catch (error) {
    return jsonResponse({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

## Example fetch call

The frontend button already does this through the local proxy route, but this is the request shape:

```ts
await fetch('/api/integrations/google-sheets', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    platform: 'LinkedIn',
    content: 'Your post copy goes here',
    timestamp: new Date().toISOString(),
    imageUrl: 'https://example.com/post-image.jpg',
  }),
});
```

## Deploy as a Web App

1. Open Google Sheets and create the destination spreadsheet.
2. Go to `Extensions` -> `Apps Script`.
3. Paste in the script above and update `SHEET_NAME` if needed.
4. Click `Deploy` -> `New deployment`.
5. Choose `Web app`.
6. Set `Execute as` to `Me`.
7. Set `Who has access` to `Anyone`.
8. Deploy and copy the `/exec` URL.
9. Add that URL to `GOOGLE_SHEETS_WEB_APP_URL`.

## Notes

- The content studio button sends `Twitter` for `x` posts and `LinkedIn` for LinkedIn posts.
- If a post is not scheduled yet, the frontend falls back to `next day at 09:00` as the sheet timestamp.
- If a post image exists, its URL is included in the sheet row.
- Keeping the Apps Script URL on the server avoids exposing integration config directly to the browser.
