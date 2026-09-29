param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [string]$ReportDir = 'reports'
)

$source = @'
using System;
using System.Runtime.InteropServices;

public static class SofievkaCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr buffer);
}
'@

if (-not ('SofievkaCredentialManager' -as [type])) {
  Add-Type -TypeDefinition $source
}

$credentialPointer = [IntPtr]::Zero
if (-not [SofievkaCredentialManager]::CredRead('Supabase CLI:supabase', 1, 0, [ref]$credentialPointer)) {
  throw 'Supabase CLI credential was not found in Windows Credential Manager.'
}

try {
  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
    $credentialPointer,
    [type][SofievkaCredentialManager+Credential]
  )
  $tokenBytes = New-Object byte[] $credential.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy(
    $credential.CredentialBlob,
    $tokenBytes,
    0,
    [int]$credential.CredentialBlobSize
  )
  $token = [Text.Encoding]::UTF8.GetString($tokenBytes).TrimEnd([char]0)
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'Supabase CLI credential is empty.'
  }
  $env:SOFIEVKA_SUPABASE_ACCESS_TOKEN = $token
  & node "$PSScriptRoot/run-remote-catalog-sql-checks.mjs" "--project-ref=$ProjectRef" "--report-dir=$ReportDir"
  if ($LASTEXITCODE -ne 0) {
    throw "Remote catalog SQL checks exited with code $LASTEXITCODE."
  }
}
finally {
  Remove-Item Env:SOFIEVKA_SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($credentialPointer -ne [IntPtr]::Zero) {
    [SofievkaCredentialManager]::CredFree($credentialPointer)
  }
}
