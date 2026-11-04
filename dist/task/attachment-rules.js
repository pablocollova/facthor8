(function (root) {
  const types = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  const rules = {
    bucket: 'task-email-attachments', maxCount: 6, maxFile: 5*1024*1024, maxTotal: 15*1024*1024,
    accept: Object.keys(types).map(x=>'.'+x).join(','),
    validate(file) {
      const name = file.name ?? file.filename;
      const size = file.size ?? file.byte_size;
      const type = file.type ?? file.content_type;
      if (typeof name !== 'string' || !name.trim() || name.length>180 || /[\x00-\x1f\x7f/\\]/.test(name)) throw Error('Nombre de archivo inválido.');
      const expected = types[name.split('.').pop().toLowerCase()];
      if (!expected || (type && type !== expected)) throw Error('Formato no permitido: '+name);
      if (!Number.isSafeInteger(size) || size<=0) throw Error('El archivo está vacío: '+name);
      if (size>rules.maxFile) throw Error('Máximo 5 MB por archivo: '+name);
      return expected;
    },
    validateList(files) {
      if (files.length>rules.maxCount) throw Error('Máximo 6 adjuntos por correo.');
      files.forEach(f=>rules.validate(f));
      if(files.reduce((s,f)=>s+(f.size??f.byte_size),0)>rules.maxTotal) throw Error('Máximo 15 MB de adjuntos por correo.');
    }
  };
  if(typeof module!=='undefined') module.exports=rules;
  else root.AttachmentRules=rules;
})(globalThis);
