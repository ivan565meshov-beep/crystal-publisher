// VK: пост на стену сообщества с фото (карусель) или видео (рилс)
// Нужен ключ пользователя-администратора группы с правами wall, photos, video, groups, offline
const fs = require('fs'), path = require('path');
const V = '5.199';
async function vk(method, params) {
  const r = await fetch(`https://api.vk.com/method/${method}`, { method: 'POST', body: new URLSearchParams({ ...params, access_token: process.env.VK_TOKEN, v: V }) });
  const j = await r.json(); if (j.error) throw new Error(`VK ${method}: ${j.error.error_msg}`); return j.response;
}
async function upload(url, field, file) {
  const fd = new FormData(); fd.append(field, await fs.openAsBlob(file), path.basename(file));
  return (await fetch(url, { method: 'POST', body: fd })).json();
}
async function post({ text = '', photos, video, title }) {
  const gid = process.env.VK_GROUP_ID, att = [];
  if (photos?.length) {
    const srv = await vk('photos.getWallUploadServer', { group_id: gid });
    for (const p of photos.slice(0, 10)) {
      const u = await upload(srv.upload_url, 'photo', p);
      const [ph] = await vk('photos.saveWallPhoto', { group_id: gid, photo: u.photo, server: u.server, hash: u.hash });
      att.push(`photo${ph.owner_id}_${ph.id}`);
    }
  }
  if (video) {
    const s = await vk('video.save', { group_id: gid, name: (title || 'CRYSTAL FINANCE').slice(0, 120), description: text.slice(0, 4000), wallpost: 0 });
    const u = await upload(s.upload_url, 'video_file', video);
    att.push(`video${u.owner_id || -gid}_${u.video_id || s.video_id}`);
  }
  const r = await vk('wall.post', { owner_id: -gid, from_group: 1, message: text, attachments: att.join(',') });
  return `https://vk.com/wall-${gid}_${r.post_id}`;
}
module.exports = { post };
