#include <stdio.h>
#include <process.h>
#include <string.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    char **new_argv = malloc((argc + 4) * sizeof(char *));
    char original_path[2048];
    
    // Copy argv[0] to original_path
    strcpy(original_path, argv[0]);
    
    // Find the last backslash to replace the filename
    char *p = strrchr(original_path, '\\');
    if (p) {
        strcpy(p + 1, "7za-original.exe");
    } else {
        // Try forward slash just in case
        p = strrchr(original_path, '/');
        if (p) {
            strcpy(p + 1, "7za-original.exe");
        } else {
            strcpy(original_path, "7za-original.exe");
        }
    }

    new_argv[0] = original_path;
    for (int i = 1; i < argc; i++) {
        new_argv[i] = argv[i];
    }
    // Append exclusion arguments
    new_argv[argc] = "-xr!darwin";
    new_argv[argc + 1] = "-xr!linux";
    new_argv[argc + 2] = NULL;

    // Execute the original executable
    int ret = _spawnv(_P_WAIT, original_path, (const char * const *)new_argv);
    
    if (ret == -1) {
        fprintf(stderr, "Wrapper failed to spawn: %s\n", original_path);
        perror("Error");
        return 1;
    }

    return ret;
}
