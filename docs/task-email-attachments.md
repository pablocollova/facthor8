# Adjuntos de /task

Cada borrador admite hasta 6 archivos, 5 MiB por archivo y 15 MiB en total. Se permiten JPG/JPEG, PNG, GIF, WebP, PDF, TXT, CSV, DOCX, XLSX y PPTX. Se comprueban extensión, MIME, tamaño, cantidad y existencia del objeto antes de enviar. No se permiten archivos vacíos, SVG, HTML ni ejecutables.

Los archivos están en el bucket privado `task-email-attachments`. La tabla `task_email_attachments` conserva nombre, MIME, tamaño, ruta, autor y estado de subida, vinculados al UUID de `task_emails`. Solo el creador del correo puede acceder a sus adjuntos; los permisos generales del tablero no conceden acceso. No se utilizan enlaces públicos ni claves de servicio en el navegador.

Al seleccionar archivos se guarda el borrador y se reservan sus metadatos. Una subida fallida queda pendiente y visible: eliminarla y volver a adjuntar. Los pendientes cuentan para los límites y bloquean el envío. Para eliminar un adjunto se elimina primero el objeto privado y después sus metadatos. La eliminación de la tarea limpia previamente sus archivos; los correos enviados o pendientes de confirmar se conservan.

El endpoint descarga cada archivo con la sesión del usuario, comprueba que los bytes coincidan con los metadatos y envía a Hostinger `attachments: [{filename, content, contentType, encoding: 'base64'}]`. Para correos sin archivos se omite `attachments`. La firma no contiene adjuntos vacíos.

El cambio a `sending` es condicional al estado y fecha de edición del borrador, para bloquear envíos simultáneos. Un rechazo explícito 4xx guarda `failed` sin perder el contenido ni los adjuntos. Una interrupción o respuesta ambigua mantiene `sending`: revisar la carpeta Enviados antes de corregir manualmente el estado. No hay reintentos automáticos del proveedor. Una aceptación de Hostinger nunca se comunica como fallo reenviable si falla el guardado posterior.

Se conserva la programación existente. El despachador automático todavía no está activado, tal como indicaba la aplicación antes de este cambio.

## Configuración

Variables del endpoint en Vercel: `SUPABASE_PUBLISHABLE_KEY`, `HOSTINGER_MAIL_TOKEN` y `HOSTINGER_MAILBOX_ID`. No se necesitan variables secretas adicionales. Las migraciones de esta entrega ya se aplicaron al proyecto `opqbgwzmbkzkfpldrjlx`. Para otro entorno hay que aplicar las migraciones antes de publicar la interfaz. El repositorio no incluye el historial completo del esquema anterior.

## Verificación

`npm test` ejecuta las pruebas del endpoint con Supabase y Hostinger simulados, y las pruebas de lógica de interfaz: selección de seis archivos, persistencia al reabrir, eliminación, límites y recuperación tras una subida interrumpida. Ninguna prueba envía correos reales.

`tests/attachment-permissions.sql` comprueba en una transacción revertida los permisos de propietario y usuario ajeno, límite de seis archivos, rechazo de un objeto inexistente y bloqueo durante envío. Ejecutar contra una base con al menos un perfil y el esquema existente.

La prueba con una sesión real de navegador y la entrega efectiva a un destinatario requieren validación posterior. No se ha enviado correo real durante esta implementación.
