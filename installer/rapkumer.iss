#define AppName "Kaganga"
#define AppVersion "2.1.7"
#define StagePath "..\\dist\\windows\\stage\\Kaganga"

[Setup]
AppId={{06E10F9F-0AD2-4F31-A64B-7C3B36F2D0D6}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher="Kaganga"
AppPublisherURL="https://github.com/Argilang14/Kaganga-Data"
AppContact="me@apoxi.cam"
; Install under the current user's Local AppData so admin privileges are not required
DefaultDirName={localappdata}\Kaganga
DefaultGroupName=Kaganga
DisableProgramGroupPage=yes
OutputDir=..\dist\windows
OutputBaseFilename=KagangaSetup-v{#AppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Do not require administrator privileges when installing to per-user LocalAppData
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\kaganga.ico
VersionInfoVersion={#AppVersion}
SetupIconFile={#StagePath}\kaganga.ico
LicenseFile="..\LICENSE"
; Code signing configuration (commented out by default)
; Uncomment and configure these lines if you want Inno Setup to sign the installer
; SignTool=custom "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "Administrasi guru terpadu Installer" /f "installer\cert\codesign.pfx" /p "YOUR_PASSWORD" $f
; SignedUninstaller=yes

[Files]
Source:"{#StagePath}\\*"; DestDir:"{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source:"files\\start-rapkumer.mjs"; DestDir:"{app}"; Flags: ignoreversion
Source:"..\dist\windows\vc_redist.x64.exe"; DestDir:"{tmp}"; Flags: ignoreversion deleteafterinstall

[InstallDelete]
Type: files; Name: "{autodesktop}\Rapkumer.lnk"
Type: filesandordirs; Name: "{autoprograms}\Rapkumer"

[Icons]
Name:"{autoprograms}\Kaganga\Kaganga"; Filename:"{sys}\cmd.exe"; Parameters:"/c ""node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\kaganga.ico"
Name:"{autodesktop}\Kaganga"; Filename:"{sys}\cmd.exe"; Parameters:"/c ""node ""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\kaganga.ico"

[Code]

function VCRedistNeedsInstall: Boolean;
var
	Version: string;
begin
	Result := True;
	if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64', 'Version', Version) then
	begin
		Log('VC++ 2015-2022 Redistributable (x64) sudah terinstall: ' + Version);
		Result := False;
	end
	else
	begin
		Log('VC++ 2015-2022 Redistributable (x64) belum terinstall.');
	end;
end;

procedure InstallVcRedist;
var
	ResultCode: Integer;
	RedistPath: string;
begin
	if not VCRedistNeedsInstall then
	begin
		Log('Melewati instalasi VC++ Redistributable (sudah terinstall).');
		Exit;
	end;

	RedistPath := ExpandConstant('{tmp}\vc_redist.x64.exe');
	if not FileExists(RedistPath) then
	begin
		Log('File VC++ redistributable tidak ditemukan di ' + RedistPath);
		Exit;
	end;

	Log('Menginstall Microsoft Visual C++ Redistributable 2015-2022...');
	if ShellExec('runas', RedistPath, '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
	begin
		if ResultCode = 0 then
			Log('VC++ Redistributable berhasil diinstall.')
		else
			Log(Format('VC++ Redistributable selesai dengan kode: %d', [ResultCode]));
	end
	else
	begin
		Log(Format('Gagal menjalankan VC++ Redistributable installer. Kode: %d', [ResultCode]));
	end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
	EnvPath, DbPath, DbDir, S, LogDir, LogFile, SoundDir: string;
begin
	if CurStep = ssPostInstall then
	begin
		InstallVcRedist;
		DbPath := ExpandConstant('{localappdata}\Kaganga-data\database.sqlite3');
		DbDir := ExtractFileDir(DbPath);
		if not DirExists(DbDir) then
			ForceDirectories(DbDir);
			// Ensure log directory and empty log file exist
			LogDir := ExpandConstant('{localappdata}\Kaganga-data\logs');
			if not DirExists(LogDir) then
				ForceDirectories(LogDir);
			LogFile := LogDir + '\\kaganga.log';
			if not FileExists(LogFile) then
				SaveStringToFile(LogFile, '', False);
		// Ensure sounds directory exists
			SoundDir := ExpandConstant('{localappdata}\Kaganga-data\sounds');
			if not DirExists(SoundDir) then
				ForceDirectories(SoundDir);

		EnvPath := ExpandConstant('{app}\.env');
		S := 'DB_URL="file:' + DbPath + '"' + #13#10 + 'BODY_SIZE_LIMIT=512M' + #13#10 + 'photo="file:' + ExpandConstant('{localappdata}\Kaganga-data\uploads') + '"' + #13#10 + 'sounds="file:' + ExpandConstant('{localappdata}\Kaganga-data\sounds') + '"';
		if SaveStringToFile(EnvPath, S, False) then
			Log(Format('Wrote .env to %s', [EnvPath]))
		else
			Log(Format('Failed to write .env to %s', [EnvPath]));
	end;
end;
