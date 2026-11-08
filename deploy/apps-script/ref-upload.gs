/* Public reference-file upload endpoint; the only public endpoint in this project.
   Deploy > New deployment > Web app, Execute as Me, Anyone; copy the /exec URL
   into v3/order/api.js REF_UPLOAD_URL. Existing files are never overwritten.
   Files go to REFS_FOLDER_NAME/<key>/, apart from syncBriefs' folders, so no script lock is shared:
   a flood of uploads cannot stall briefs and mail. The browser sends one order's files one at a time.
   Caps for the whole endpoint (CacheService, approximate): RATE_PER_MIN requests a minute, checked
   before the Firestore read, and BYTES_PER_WINDOW bytes saved per 6 hours. */

var REFS_FOLDER_NAME = 'getsite-order-refs';
var RATE_PER_MIN = 60;
var BYTES_PER_WINDOW = 1024 * 1024 * 1024;

function bump_(cache, name, by, ttl) {
  var n = Number(cache.get(name) || 0) + by;
  cache.put(name, String(n), ttl);
  return n;
}

function doPost(e) {
  var text = e && e.postData && e.postData.contents;
  return ContentService.createTextOutput(JSON.stringify(handleRefUpload_(text, function () { return Date.now(); })))
    .setMimeType(ContentService.MimeType.JSON);
}

function refMagicOk_(ext, bytes) {
  function match(offset, values) {
    if (bytes.length < offset + values.length) return false;
    return values.every(function (value, i) { return (bytes[offset + i] & 0xff) === value; });
  }
  function ascii(offset, value) {
    return match(offset, value.split('').map(function (c) { return c.charCodeAt(0); }));
  }
  if (ext === 'jpg') return match(0, [0xff, 0xd8, 0xff]);
  if (ext === 'png') return match(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === 'gif') return ascii(0, 'GIF87a') || ascii(0, 'GIF89a');
  if (ext === 'webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP');
  if (ext === 'heic') return ascii(4, 'ftyp') &&
    ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].some(function (brand) { return ascii(8, brand); });
  if (ext === 'zip') return match(0, [0x50, 0x4b, 0x03, 0x04]) || match(0, [0x50, 0x4b, 0x05, 0x06]);
  return false;
}

function handleRefUpload_(text, clock) {
  var key = '';
  function fail(code) { return {ok: false, error: code}; }
  try {
    if (typeof text !== 'string' || text.length > 28000000) return fail('bad-request');
    var body;
    try { body = JSON.parse(text); } catch (parseError) { return fail('bad-request'); }
    if (!body || typeof body.key !== 'string' || typeof body.name !== 'string' ||
        typeof body.type !== 'string' || typeof body.data !== 'string') return fail('bad-request');
    key = body.key;
    if (!KEY_RE.test(key)) return fail('bad-key');
    var nameMatch = /^ref-([1-9]|10)\.(jpg|png|webp|gif|heic|zip)$/.exec(body.name);
    if (!nameMatch) return fail('bad-name');
    var ext = nameMatch[2];
    var types = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', zip: 'application/zip'};
    if (body.type !== types[ext]) return fail('bad-type');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) return fail('bad-request');
    var bytes;
    try { bytes = Utilities.base64Decode(body.data); } catch (decodeError) { return fail('bad-request'); }
    if (bytes.length < 1 || bytes.length > 20 * 1024 * 1024) return fail('bad-size');
    if (!refMagicOk_(ext, bytes)) return fail('bad-content');
    var cache = CacheService.getScriptCache();
    if (bump_(cache, 'rate-' + Math.floor(clock() / 60000), 1, 120) > RATE_PER_MIN) return fail('busy');
    var doc;
    try { doc = request_('GET', BASE + '/orders/' + encodeURIComponent(key)); }
    catch (requestError) {
      if (String(requestError.message).indexOf(' 404 ') !== -1) return fail('no-order');
      throw requestError;
    }
    var order = fromValue_({mapValue: {fields: doc.fields}});
    var files = order.brief && order.brief.references && order.brief.references.files;
    if (typeof files !== 'string' || files.length > 120) return fail('not-listed');
    var list = files.split(',');
    if (list.length > 10 || list.indexOf(body.name) === -1) return fail('not-listed');
    var created = typeof order.createdAt === 'string' ? Date.parse(order.createdAt) : NaN;
    var deadline = created + 60 * 60 * 1000;
    if (!isFinite(created) || !(clock() < deadline)) return fail('expired');
    var bucket = 'bytes-' + Math.floor(clock() / 21600000);
    if (Number(cache.get(bucket) || 0) + bytes.length > BYTES_PER_WINDOW) return fail('busy');
    var folders = DriveApp.getFoldersByName(REFS_FOLDER_NAME);
    var root = folders.hasNext() ? folders.next() : DriveApp.createFolder(REFS_FOLDER_NAME);
    var folder = childFolder_(root, key);
    if (folder.getFilesByName(body.name).hasNext()) return {ok: true, exists: true};
    if (!(clock() < deadline)) return fail('expired');
    folder.createFile(Utilities.newBlob(bytes, body.type, body.name));
    bump_(cache, bucket, bytes.length, 21600);
    return {ok: true};
  } catch (error) {
    console.error('Reference upload failed ' + key.slice(0, 12));
    return fail('server');
  }
}
