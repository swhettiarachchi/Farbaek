package com.farbaek.app.mesh;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructStat;

import com.farbaek.mesh.GuardedFolder;

import java.io.File;
import java.io.IOException;

/**
 * What a file really is, from lstat (ADR 0193): a symbolic link, or a file
 * with more than one hard link, is never written through when receiving.
 * java.io alone can't see hard links.
 */
final class LstatProbe implements GuardedFolder.FileProbe {
    @Override
    public boolean isLink(File file) throws IOException {
        // The guard also asks about names it's about to create: nothing there is no link.
        try {
            return OsConstants.S_ISLNK(Os.lstat(file.getPath()).st_mode);
        } catch (ErrnoException e) {
            if (e.errno == OsConstants.ENOENT) return false;
            throw new IOException("That file can't be checked.", e);
        }
    }

    @Override
    public long linkCount(File file) throws IOException {
        return stat(file).st_nlink;
    }

    private static StructStat stat(File file) throws IOException {
        try {
            return Os.lstat(file.getPath());
        } catch (ErrnoException e) {
            throw new IOException("That file can't be checked.", e);
        }
    }
}
