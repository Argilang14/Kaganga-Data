# Metadata Update Kaganga

Salin `latest.json` ke repo publik `Argilang14/kaganga-update`.

URL yang dibaca aplikasi:

```text
https://raw.githubusercontent.com/Argilang14/kaganga-update/main/latest.json
```

Setiap rilis baru:

1. Naikkan `version`.
2. Build `KagangaSetup.exe`.
3. Upload installer ke GitHub Release repo `kaganga-update`.
4. Ubah `installerUrl`, `htmlUrl`, `releasedAt`, `installerSize`, dan `notes`.
5. Push `latest.json`.
