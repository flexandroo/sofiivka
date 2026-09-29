param(
  [string]$ProjectRef = 'wfxcklglujgramasdzyr'
)

if ($ProjectRef -notin @('wfxcklglujgramasdzyr', 'fkjarsouuchjiedrrblc')) {
  throw 'Refusing performance measurement outside approved Sofievka projects.'
}

$source = @'
using System;
using System.Runtime.InteropServices;

public static class SofievkaScopedPerformanceCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
    public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", SetLastError = true)] public static extern void CredFree(IntPtr buffer);
}
'@

if (-not ('SofievkaScopedPerformanceCredentialManager' -as [type])) { Add-Type -TypeDefinition $source }
$credentialPointer = [IntPtr]::Zero
if (-not [SofievkaScopedPerformanceCredentialManager]::CredRead('Supabase CLI:supabase', 1, 0, [ref]$credentialPointer)) {
  throw 'Supabase CLI credential was not found in Windows Credential Manager.'
}

try {
  $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPointer, [type][SofievkaScopedPerformanceCredentialManager+Credential])
  $tokenBytes = New-Object byte[] $credential.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $tokenBytes, 0, [int]$credential.CredentialBlobSize)
  $env:SOFIEVKA_SUPABASE_ACCESS_TOKEN = [Text.Encoding]::UTF8.GetString($tokenBytes).TrimEnd([char]0)
  & node "$PSScriptRoot/../tests/catalog-performance-v2.mjs" "--project-ref=$ProjectRef"
  if ($LASTEXITCODE -ne 0) { throw "Scoped performance verification exited with code $LASTEXITCODE." }
}
finally {
  Remove-Item Env:SOFIEVKA_SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($credentialPointer -ne [IntPtr]::Zero) { [SofievkaScopedPerformanceCredentialManager]::CredFree($credentialPointer) }
}
