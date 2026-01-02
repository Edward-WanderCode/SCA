Function Get-Folder($initialDirectory) {
    [System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
    
    $OpenFileDialog = New-Object System.Windows.Forms.OpenFileDialog
    $OpenFileDialog.initialDirectory = $initialDirectory
    $OpenFileDialog.filter = "Folders| |All Files|*.*"
    $OpenFileDialog.checkFileExists = $false
    $OpenFileDialog.checkPathExists = $true
    $OpenFileDialog.Title = "Select Project Folder"
    $OpenFileDialog.FileName = "Select Folder"
    
    $res = $OpenFileDialog.ShowDialog()
    if ($res -eq "OK") {
        $folderPath = $OpenFileDialog.FileName
        # If the user selected the dummy file, get the directory
        if ($folderPath.EndsWith("Select Folder")) {
             $folderPath = [System.IO.Path]::GetDirectoryName($folderPath)
        }
        return $folderPath
    } else {
        return $null
    }
}

$path = Get-Folder
if ($path) { Write-Output $path }
