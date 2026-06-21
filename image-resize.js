// ============================================================
// image-resize.js — client-side downscale before upload.
//
// Replaces hard photo-size limits. Any photo a teacher picks is
// scaled so its long edge is <= maxDim and re-encoded as JPEG, so a
// 15-20MB phone shot becomes ~0.5-1MB and always fits the Apps Script
// POST. Teachers never see a "too large" error and never have to
// compress anything themselves.
//
// Usage in a form:
//   <script src="../image-resize.js"></script>
//   const out = await shoonyaResizeImage(input.files[0]);
//   // out = { b64, name, type, bytes }  (b64 has NO "data:" prefix)
//   payload.photo_b64  = out ? out.b64  : null;
//   payload.photo_name = out ? out.name : '';
//
// Falls back to the original bytes if the file isn't a raster image
// (e.g. SVG) or if canvas encoding fails — so nothing ever silently
// drops a file.
// ============================================================
(function () {
  function readRaw(file) {
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () {
        resolve({
          b64: String(r.result || '').split(',')[1] || null,
          name: file.name || 'photo',
          type: file.type || '',
          bytes: file.size || 0
        });
      };
      r.onerror = function () { resolve(null); };
      r.readAsDataURL(file);
    });
  }

  // Resize a File/Blob so its long edge is <= maxDim, return a base64
  // string (no data: prefix) plus a sensible .jpg filename + mime.
  window.shoonyaResizeImage = function (file, opts) {
    opts = opts || {};
    var maxDim = opts.maxDim || 2000;
    var quality = opts.quality != null ? opts.quality : 0.85;

    return new Promise(function (resolve) {
      if (!file) { resolve(null); return; }

      // Only raster images can be drawn to a canvas. SVG / non-images
      // pass through untouched.
      if (!/^image\//.test(file.type) || /svg/.test(file.type)) {
        readRaw(file).then(resolve);
        return;
      }

      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var tw = Math.max(1, Math.round(w * scale));
          var th = Math.max(1, Math.round(h * scale));

          var canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          var ctx = canvas.getContext('2d');
          // White matte so transparent PNGs don't go black as JPEG.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(img, 0, 0, tw, th);

          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);

          var b64 = dataUrl.split(',')[1] || null;
          if (!b64) { readRaw(file).then(resolve); return; }

          var base = (file.name || 'photo').replace(/\.[^.]+$/, '');
          resolve({
            b64: b64,
            name: base + '.jpg',
            type: 'image/jpeg',
            bytes: Math.round(b64.length * 0.75)
          });
        } catch (e) {
          URL.revokeObjectURL(url);
          readRaw(file).then(resolve);
        }
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        readRaw(file).then(resolve);
      };

      img.src = url;
    });
  };
})();
