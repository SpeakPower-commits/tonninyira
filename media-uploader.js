/* Tonninyira media uploader (shared by the vendor dashboard, registration and admin).
 *
 * The project runs on Supabase's free plan: 50 MB per file, 1 GB in total and a
 * small monthly viewing allowance. So everything is made small ON THE PHONE
 * before it leaves:
 *   - photos are resized to 1600 px on the long side (WebP/JPEG, ~200-400 KB);
 *   - videos (max 5 min) are re-encoded to 480p MP4 with the phone's own video
 *     encoder (WebCodecs, via the mediabunny library), ~30 MB for 5 minutes,
 *     and a cover frame is saved beside them so the storefront shows a picture
 *     and only downloads the video when a customer taps play.
 * Files go to media/<user id>/... (the only place the storage policy allows),
 * and anything over 6 MB is sent with resumable uploads so a dropped mobile
 * connection continues instead of starting again.
 *
 * API: window.TNMedia = { prepareImage, prepareVideo, upload, remove, LIMITS }
 */
(function(){
  'use strict';
  const BUCKET = 'tonninyira-media';
  const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.60.0/dist/bundles/mediabunny.min.mjs';
  const LIMITS = { photoEdge: 1600, maxVideoSeconds: 300, maxFileBytes: 49 * 1024 * 1024, uncompressedOkBytes: 45 * 1024 * 1024 };
  const CHUNK = 6 * 1024 * 1024; // Supabase's resumable endpoint requires exactly 6 MB chunks

  const client = () => { try{ if(typeof supabaseClient!=='undefined'&&supabaseClient) return supabaseClient }catch(_){} return window.supabaseClient; };
  const baseUrl = () => client()?.supabaseUrl || (typeof SUPABASE_URL!=='undefined' ? SUPABASE_URL : '');
  const anonKey = () => client()?.supabaseKey || (typeof SUPABASE_ANON_KEY!=='undefined' ? SUPABASE_ANON_KEY : '');
  const publicUrl = path => `${baseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;

  class MediaError extends Error {}

  /* ---------- photos ---------- */
  function canvasBlob(canvas, type, q){ return new Promise(r => canvas.toBlob(r, type, q)); }
  async function prepareImage(file, edge = LIMITS.photoEdge){
    if(!file || !/^image\//.test(file.type)) throw new MediaError('Please choose a photo.');
    let bmp;
    try{ bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch(_){ throw new MediaError('This photo could not be opened. Try a JPG or PNG photo.'); }
    const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.();
    let blob = await canvasBlob(c, 'image/webp', 0.82);
    if(!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/jpeg', 0.84); // older iPhones
    if(!blob) throw new MediaError('This photo could not be prepared.');
    return { blob, width: w, height: h, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
  }

  /* ---------- videos ---------- */
  function videoElement(src){
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = src;
      v.onloadedmetadata = () => resolve(v);
      v.onerror = () => reject(new MediaError('This video could not be opened on this phone.'));
    });
  }
  async function posterFrom(file, duration){
    const url = URL.createObjectURL(file);
    try{
      const v = await videoElement(url);
      await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(1.5, (duration || v.duration || 2) / 3); });
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return await canvasBlob(c, 'image/jpeg', 0.8);
    }catch(_){ return null; } finally { URL.revokeObjectURL(url); }
  }
  async function probe(file){
    const url = URL.createObjectURL(file);
    try{
      const v = await videoElement(url);
      /* Browser-recorded WebM reports Infinity until the player seeks to the end. */
      if(!isFinite(v.duration)) await new Promise(r => { const t = setTimeout(r, 4000); v.ondurationchange = () => { if(isFinite(v.duration)){ clearTimeout(t); r(); } }; v.currentTime = 1e7; });
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
    }
    finally{ URL.revokeObjectURL(url); }
  }
  const even = n => Math.max(2, Math.round(n / 2) * 2);

  async function compress(file, bitrate, onProgress){
    const MB = await import(MEDIABUNNY);
    /* H.264 in MP4 plays everywhere; phones without an H.264 encoder fall back to VP9 in WebM. */
    const avc = await MB.canEncodeVideo('avc').catch(() => false);
    const vp9 = !avc && await MB.canEncodeVideo('vp9').catch(() => false);
    if(!avc && !vp9) throw new MediaError('no encoder');
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    const output = new MB.Output({
      format: avc ? new MB.Mp4OutputFormat({ fastStart: 'in-memory' }) : new MB.WebMOutputFormat(),
      target: new MB.BufferTarget()
    });
    const conversion = await MB.Conversion.init({
      input, output,
      video: track => {
        const w = track.displayWidth, h = track.displayHeight, s = Math.min(1, 480 / Math.min(w, h));
        return { width: even(w * s), height: even(h * s), fit: 'fill', codec: avc ? 'avc' : 'vp9', bitrate, frameRate: 30, forceTranscode: true };
      },
      audio: { bitrate: 64000, numberOfChannels: 1 }
    });
    if(!conversion.isValid) throw new MediaError('unsupported');
    conversion.onProgress = p => onProgress?.(p);
    await conversion.execute();
    return { blob: new Blob([output.target.buffer], { type: avc ? 'video/mp4' : 'video/webm' }), ext: avc ? 'mp4' : 'webm' };
  }

  /* Returns { blob, poster, duration, ext, compressed } or throws MediaError with a plain-words reason. */
  async function prepareVideo(file, onProgress){
    if(!file || !/^video\//.test(file.type)) throw new MediaError('Please choose a video.');
    const info = await probe(file);
    if(!isFinite(info.duration) || info.duration <= 0) throw new MediaError('This video could not be read. Try recording it again.');
    if(info.duration > LIMITS.maxVideoSeconds + 5) throw new MediaError(`This video is ${fmt(info.duration)} long. Videos can be up to 5 minutes — trim it and try again.`);
    const poster = await posterFrom(file, info.duration);
    const light = file.type === 'video/mp4' && (file.size * 8 / info.duration) <= 1.4e6 && file.size <= LIMITS.maxFileBytes;
    if(light) return { blob: file, poster, duration: info.duration, ext: 'mp4', compressed: false };
    let out = null;
    try{
      out = await compress(file, 850000, onProgress);
      if(out.blob.size > LIMITS.maxFileBytes) out = await compress(file, 550000, onProgress);
    }catch(e){
      console.log('[Tonninyira] video compression unavailable:', e?.message || e);
      if(file.size <= LIMITS.uncompressedOkBytes)
        return { blob: file, poster, duration: info.duration, ext: (file.name.split('.').pop() || 'mp4').toLowerCase(), compressed: false };
      throw new MediaError(`This phone can't shrink videos, and this one is ${(file.size / 1048576).toFixed(0)} MB (the limit is 45 MB). Record a shorter clip or use a lower camera quality.`);
    }
    if(out.blob.size > LIMITS.maxFileBytes) throw new MediaError('Even after shrinking, this video is too large. Try a shorter clip.');
    return { blob: out.blob, poster, duration: info.duration, ext: out.ext, compressed: true };
  }

  /* ---------- upload ---------- */
  async function session(){
    const s = (await client().auth.getSession())?.data?.session;
    if(!s) throw new MediaError('Please sign in again to upload.');
    return s;
  }
  function xhr(method, url, headers, body, onUp){
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open(method, url);
      Object.entries(headers).forEach(([k, v]) => x.setRequestHeader(k, v));
      if(onUp && x.upload) x.upload.onprogress = e => e.lengthComputable && onUp(e.loaded);
      x.onload = () => resolve(x); x.onerror = () => reject(new MediaError('No connection. Check your data and try again.'));
      x.send(body);
    });
  }
  const b64 = s => btoa(unescape(encodeURIComponent(s)));

  async function simpleUpload(path, blob, token, onProgress){
    const r = await xhr('POST', `${baseUrl()}/storage/v1/object/${BUCKET}/${path}`,
      { authorization: `Bearer ${token}`, apikey: anonKey(), 'content-type': blob.type, 'x-upsert': 'false', 'cache-control': '31536000' },
      blob, n => onProgress?.(n / blob.size));
    if(r.status >= 300){ let m = ''; try{ m = JSON.parse(r.responseText).message }catch(_){} throw new MediaError(m || `Upload failed (${r.status}).`); }
  }
  async function resumableUpload(path, blob, token, onProgress){
    const endpoint = `${baseUrl()}/storage/v1/upload/resumable`;
    const meta = `bucketName ${b64(BUCKET)},objectName ${b64(path)},contentType ${b64(blob.type)},cacheControl ${b64('31536000')}`;
    const c = await xhr('POST', endpoint, { authorization: `Bearer ${token}`, apikey: anonKey(), 'tus-resumable': '1.0.0', 'upload-length': String(blob.size), 'upload-metadata': meta, 'x-upsert': 'false' }, null);
    if(c.status !== 201) throw new MediaError(`Upload could not start (${c.status}).`);
    let loc = c.getResponseHeader('location'); if(!loc) throw new MediaError('Upload could not start.');
    if(!/^https?:/.test(loc)) loc = new URL(loc, endpoint).href;
    let offset = 0, tries = 0;
    while(offset < blob.size){
      const chunk = blob.slice(offset, Math.min(offset + CHUNK, blob.size));
      try{
        const r = await xhr('PATCH', loc, { authorization: `Bearer ${token}`, apikey: anonKey(), 'tus-resumable': '1.0.0', 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
          chunk, n => onProgress?.((offset + n) / blob.size));
        if(r.status !== 204) throw new MediaError(`Upload interrupted (${r.status}).`);
        offset = Number(r.getResponseHeader('upload-offset')) || offset + chunk.size; tries = 0;
      }catch(e){
        if(++tries > 6) throw e instanceof MediaError ? e : new MediaError('Upload interrupted. Check your connection and try again.');
        await new Promise(r => setTimeout(r, 1500 * tries));
        const h = await xhr('HEAD', loc, { authorization: `Bearer ${token}`, apikey: anonKey(), 'tus-resumable': '1.0.0' }, null).catch(() => null);
        if(h && h.status === 200) offset = Number(h.getResponseHeader('upload-offset')) || offset;
      }
    }
    onProgress?.(1);
  }

  /* Uploads a Blob to media/<uid>/<kind>-<time>-<rand>.<ext>; returns its public URL. */
  async function upload(blob, { kind = 'file', ext = 'bin', onProgress } = {}){
    if(blob.size > LIMITS.maxFileBytes) throw new MediaError('This file is larger than 49 MB.');
    const s = await session();
    const path = `media/${s.user.id}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    if(blob.size > CHUNK) await resumableUpload(path, blob, s.access_token, onProgress);
    else await simpleUpload(path, blob, s.access_token, onProgress);
    return publicUrl(path);
  }

  /* Deletes a file this account uploaded (others are left alone). */
  async function remove(url){
    const prefix = `${baseUrl()}/storage/v1/object/public/${BUCKET}/`;
    if(!url || !url.startsWith(prefix)) return;
    const path = url.slice(prefix.length);
    if(!path.startsWith('media/')) return;
    try{ await client().storage.from(BUCKET).remove([path]); }catch(_){}
  }

  function fmt(sec){ sec = Math.round(sec || 0); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

  window.TNMedia = { prepareImage, prepareVideo, upload, remove, fmt, LIMITS, MediaError };
})();
