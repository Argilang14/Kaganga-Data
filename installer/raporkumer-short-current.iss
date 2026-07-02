#define AppName "Rapor Kurikulum Merdeka"
#define AppVersion "1.6.7"
#define StagePath "C:\Users\gurus\Documents\Codex\RapkumerStageUpdate"

[Setup]
AppId={{06E10F9F-0AD2-4F31-A64B-7C3B36F2D0D6}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher="Rapkumer"
AppPublisherURL="https://github.com/sira313/raporkumer"
AppContact="me@apoxi.cam"
DefaultDirName={localappdata}\Rapkumer
DefaultGroupName=Rapkumer
DisableProgramGroupPage=yes
OutputDir=..\dist\windows
OutputBaseFilename=RapkumerSetup
Compression=zip
SolidCompression=no
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\rapkumer.ico
VersionInfoVersion={#AppVersion}
SetupIconFile={#StagePath}\rapkumer.ico

[Files]
Source:"{#StagePath}\*"; DestDir:"{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source:"files\start-rapkumer.mjs"; DestDir:"{app}"; Flags: ignoreversion
Source:"..\dist\windows\vc_redist.x64.exe"; DestDir:"{tmp}"; Flags: ignoreversion deleteafterinstall

[Run]
Filename:"{app}\Rapkumer.exe"; Parameters:"""{app}\scripts\migrate-installed-db.mjs"""; WorkingDir:"{app}"; StatusMsg:"Menjalankan migrasi database (drizzle-kit) pada mesin ini..."; Flags: runhidden waituntilterminated

[Icons]
Name:"{autoprograms}\Rapkumer\Rapkumer"; Filename:"{app}\Rapkumer.exe"; Parameters:"""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\rapkumer.ico"
Name:"{autodesktop}\Rapkumer"; Filename:"{app}\Rapkumer.exe"; Parameters:"""{app}\start-rapkumer.mjs"""; WorkingDir:"{app}"; IconFilename:"{app}\rapkumer.ico"

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
	EnvPath, DbPath, DbDir, S, SrcDb, LogDir, LogFile: string;
begin
	if CurStep = ssPostInstall then
	begin
		InstallVcRedist;
		DbPath := ExpandConstant('{localappdata}\Rapkumer-data\database.sqlite3');
		DbDir := ExtractFileDir(DbPath);
		if not DirExists(DbDir) then
			ForceDirectories(DbDir);
			SrcDb := ExpandConstant('{localappdata}\Rapkumer\data\database.sqlite3');
			if (not FileExists(DbPath)) and FileExists(SrcDb) then
			begin
				if not CopyFile(SrcDb, DbPath, False) then
					Log(Format('Failed to copy initial database from %s to %s', [SrcDb, DbPath]));
			end;

			LogDir := ExpandConstant('{localappdata}\Rapkumer-data\logs');
			if not DirExists(LogDir) then
				ForceDirectories(LogDir);
			LogFile := LogDir + '\rapkumer.log';
			if not FileExists(LogFile) then
				SaveStringToFile(LogFile, '', False);
		EnvPath := ExpandConstant('{app}\.env');
		S := 'DB_URL="file:' + DbPath + '"' + #13#10 + 'BODY_SIZE_LIMIT=5M' + #13#10 + 'photo="file:' + ExpandConstant('{localappdata}\Rapkumer-data\uploads') + '"';
		if SaveStringToFile(EnvPath, S, False) then
			Log(Format('Wrote .env to %s', [EnvPath]))
		else
			Log(Format('Failed to write .env to %s', [EnvPath]));
	end;
end;
