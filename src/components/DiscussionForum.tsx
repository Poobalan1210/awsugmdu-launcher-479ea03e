import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { 
  MessageSquare, Send, ThumbsUp, Clock, Link2, Edit, Trash2, 
  Share2, Copy, Check, MoreVertical, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDiscussionsBySprint,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addReply,
  updateReply,
  deleteReply,
  toggleDiscussionLike,
  toggleReplyLike,
  ForumPost,
  ForumReply
} from '@/lib/discussions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DiscussionForumProps {
  sprintId: string;
}

export function DiscussionForum({ sprintId }: DiscussionForumProps) {
  const { user, isAuthenticated } = useAuth();
  const [discussions, setDiscussions] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null);
  const [deletingPost, setDeletingPost] = useState<ForumPost | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [editingReply, setEditingReply] = useState<{ postId: string; reply: ForumReply } | null>(null);
  const [deletingReply, setDeletingReply] = useState<{ postId: string; reply: ForumReply } | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Load discussions
  const loadDiscussions = async () => {
    setLoading(true);
    try {
      const data = await getDiscussionsBySprint(sprintId);
      setDiscussions(data);
    } catch (error) {
      console.error('Error loading discussions:', error);
      toast.error('Failed to load discussions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscussions();
  }, [sprintId]);

  // Handle scrolling to specific post/reply after discussions load (only on initial load)
  useEffect(() => {
    if (!loading && discussions.length > 0 && shouldAutoScroll) {
      const params = new URLSearchParams(window.location.search);
      const postId = params.get('post');
      const replyId = params.get('reply');
      
      if (postId || replyId) {
        setTimeout(() => {
          const elementId = replyId || postId;
          const element = document.getElementById(elementId!);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('highlight-post');
            setTimeout(() => element.classList.remove('highlight-post'), 3000);
          }
        }, 300);
      }
      // Disable auto-scroll after first time
      setShouldAutoScroll(false);
    }
  }, [loading, discussions, shouldAutoScroll]);

  // Create new post
  const handleCreatePost = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to post');
      return;
    }

    if (!newPostTitle.trim() || !newPostContent.trim()) {
      toast.error('Please provide both title and content');
      return;
    }

    setSubmitting(true);
    try {
      await createDiscussion({
        sprintId,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        title: newPostTitle,
        content: newPostContent
      });
      
      setNewPostTitle('');
      setNewPostContent('');
      toast.success('Post created successfully!');
      await loadDiscussions();
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  // Update post
  const handleUpdatePost = async () => {
    if (!editingPost) return;

    setSubmitting(true);
    try {
      const updatedPost = await updateDiscussion(editingPost.id, {
        title: editingPost.title,
        content: editingPost.content
      });
      
      setEditingPost(null);
      toast.success('Post updated successfully!');
      // Update state directly
      setDiscussions(discussions.map(d => 
        d.id === editingPost.id ? updatedPost : d
      ));
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete post
  const handleDeletePost = async () => {
    if (!deletingPost) return;

    try {
      await deleteDiscussion(deletingPost.id);
      setDeletingPost(null);
      toast.success('Post deleted successfully!');
      // Remove from state directly
      setDiscussions(discussions.filter(d => d.id !== deletingPost.id));
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    }
  };

  // Add reply
  const handleAddReply = async (postId: string) => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to reply');
      return;
    }

    const content = replyContent[postId]?.trim();
    if (!content) {
      toast.error('Please provide a reply');
      return;
    }

    try {
      const result = await addReply(postId, {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        content
      });
      
      setReplyContent({ ...replyContent, [postId]: '' });
      setReplyingTo(null);
      toast.success('Reply added successfully!');
      // Update state directly
      setDiscussions(discussions.map(d => 
        d.id === postId ? result.discussion : d
      ));
    } catch (error) {
      console.error('Error adding reply:', error);
      toast.error('Failed to add reply');
    }
  };

  // Update reply
  const handleUpdateReply = async () => {
    if (!editingReply) return;

    try {
      const updatedDiscussion = await updateReply(editingReply.postId, editingReply.reply.id, editingReply.reply.content);
      setEditingReply(null);
      toast.success('Reply updated successfully!');
      // Update state directly
      setDiscussions(discussions.map(d => 
        d.id === editingReply.postId ? updatedDiscussion : d
      ));
    } catch (error) {
      console.error('Error updating reply:', error);
      toast.error('Failed to update reply');
    }
  };

  // Delete reply
  const handleDeleteReply = async () => {
    if (!deletingReply) return;

    try {
      const updatedDiscussion = await deleteReply(deletingReply.postId, deletingReply.reply.id);
      setDeletingReply(null);
      toast.success('Reply deleted successfully!');
      // Update state directly
      setDiscussions(discussions.map(d => 
        d.id === deletingReply.postId ? updatedDiscussion : d
      ));
    } catch (error) {
      console.error('Error deleting reply:', error);
      toast.error('Failed to delete reply');
    }
  };

  // Toggle like on post
  const handleToggleLike = async (postId: string) => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to like');
      return;
    }

    try {
      const result = await toggleDiscussionLike(postId, user.id);
      // Update state directly instead of reloading
      setDiscussions(discussions.map(d => 
        d.id === postId ? result.discussion : d
      ));
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to update like');
    }
  };

  // Toggle like on reply
  const handleToggleReplyLike = async (postId: string, replyId: string) => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to like');
      return;
    }

    try {
      const result = await toggleReplyLike(postId, replyId, user.id);
      // Update state directly instead of reloading
      setDiscussions(discussions.map(d => 
        d.id === postId ? result.discussion : d
      ));
    } catch (error) {
      console.error('Error toggling reply like:', error);
      toast.error('Failed to update like');
    }
  };

  // Share post
  const handleSharePost = (postId: string) => {
    const url = `${window.location.origin}/skill-sprint?sprint=${sprintId}&post=${postId}`;
    setShareUrl(url);
    setShareDialogOpen(true);
  };

  // Share reply
  const handleShareReply = (postId: string, replyId: string) => {
    const url = `${window.location.origin}/skill-sprint?sprint=${sprintId}&post=${postId}&reply=${replyId}`;
    setShareUrl(url);
    setShareDialogOpen(true);
  };

  // Copy to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-8 text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading discussions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Sprint Discussion Forum
        </CardTitle>
        <CardDescription>
          Ask questions, share learnings, and help fellow participants
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* New Post Form */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-3">
              <Input 
                placeholder="Post title..." 
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                disabled={!isAuthenticated}
              />
              <Textarea 
                placeholder={isAuthenticated ? "Share your thoughts or ask a question..." : "Please log in to post"}
                rows={3}
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                disabled={!isAuthenticated}
              />
              <Button 
                size="sm" 
                onClick={handleCreatePost}
                disabled={!isAuthenticated || submitting || !newPostTitle.trim() || !newPostContent.trim()}
              >
                {submitting ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Post
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Posts */}
        <div className="space-y-4">
          {discussions.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No discussions yet. Be the first to start one!</p>
            </div>
          ) : (
            <AnimatePresence>
              {discussions.map((post) => {
                const isAuthor = user && post.userId === user.id;
                const hasLiked = user && post.likedBy?.includes(user.id);

                return (
                  <motion.div
                    key={post.id}
                    id={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <Card className="border">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={post.userAvatar} />
                            <AvatarFallback>{post.userName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{post.userName}</span>
                                <span className="text-sm text-muted-foreground">
                                  · {format(parseISO(post.createdAt), 'MMM d, yyyy')}
                                </span>
                                {post.updatedAt && post.updatedAt !== post.createdAt && (
                                  <Badge variant="outline" className="text-xs">Edited</Badge>
                                )}
                              </div>
                              {isAuthor && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setEditingPost(post)}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => setDeletingPost(post)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                            <h4 className="font-medium mb-2">{post.title}</h4>
                            <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{post.content}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <button 
                                className={`flex items-center gap-1 hover:text-primary transition-colors ${hasLiked ? 'text-primary' : ''}`}
                                onClick={() => handleToggleLike(post.id)}
                                disabled={!isAuthenticated}
                              >
                                <ThumbsUp className={`h-4 w-4 ${hasLiked ? 'fill-current' : ''}`} />
                                {post.likes || 0}
                              </button>
                              <button 
                                className="flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}
                              >
                                <MessageSquare className="h-4 w-4" />
                                {post.replies?.length || 0} replies
                              </button>
                              <button 
                                className="flex items-center gap-1 hover:text-primary transition-colors"
                                onClick={() => handleSharePost(post.id)}
                              >
                                <Share2 className="h-4 w-4" />
                                Share
                              </button>
                            </div>

                            {/* Reply Form */}
                            {replyingTo === post.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-4 flex gap-3"
                              >
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={user?.avatar} />
                                  <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                  <Textarea
                                    placeholder="Write a reply..."
                                    rows={2}
                                    value={replyContent[post.id] || ''}
                                    onChange={(e) => setReplyContent({ ...replyContent, [post.id]: e.target.value })}
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleAddReply(post.id)}>
                                      <Send className="h-3 w-3 mr-1" />
                                      Reply
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}

                            {/* Replies */}
                            {post.replies && post.replies.length > 0 && (
                              <div className="mt-4 pl-4 border-l-2 border-muted space-y-3">
                                {post.replies.map((reply) => {
                                  const isReplyAuthor = user && reply.userId === user.id;
                                  const hasLikedReply = user && reply.likedBy?.includes(user.id);

                                  return (
                                    <div key={reply.id} id={reply.id} className="flex gap-3">
                                      <Avatar className="h-7 w-7">
                                        <AvatarImage src={reply.userAvatar} />
                                        <AvatarFallback>{reply.userName.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-center gap-2 text-sm flex-wrap">
                                            <span className="font-medium">{reply.userName}</span>
                                            <span className="text-muted-foreground">
                                              · {format(parseISO(reply.createdAt), 'MMM d')}
                                            </span>
                                            {reply.updatedAt && reply.updatedAt !== reply.createdAt && (
                                              <Badge variant="outline" className="text-xs">Edited</Badge>
                                            )}
                                          </div>
                                          {isReplyAuthor && (
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                                  <MoreVertical className="h-3 w-3" />
                                                </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditingReply({ postId: post.id, reply })}>
                                                  <Edit className="h-3 w-3 mr-2" />
                                                  Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem 
                                                  onClick={() => setDeletingReply({ postId: post.id, reply })}
                                                  className="text-destructive"
                                                >
                                                  <Trash2 className="h-3 w-3 mr-2" />
                                                  Delete
                                                </DropdownMenuItem>
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{reply.content}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                          <button 
                                            className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors ${hasLikedReply ? 'text-primary' : ''}`}
                                            onClick={() => handleToggleReplyLike(post.id, reply.id)}
                                            disabled={!isAuthenticated}
                                          >
                                            <ThumbsUp className={`h-3 w-3 ${hasLikedReply ? 'fill-current' : ''}`} />
                                            {reply.likes || 0}
                                          </button>
                                          <button 
                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                                            onClick={() => handleShareReply(post.id, reply.id)}
                                          >
                                            <Share2 className="h-3 w-3" />
                                            Share
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </CardContent>

      {/* Edit Post Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription>Make changes to your post</DialogDescription>
          </DialogHeader>
          {editingPost && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editingPost.title}
                  onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Content</label>
                <Textarea
                  value={editingPost.content}
                  onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })}
                  rows={5}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdatePost} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setEditingPost(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Reply Dialog */}
      <Dialog open={!!editingReply} onOpenChange={(open) => !open && setEditingReply(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reply</DialogTitle>
            <DialogDescription>Make changes to your reply</DialogDescription>
          </DialogHeader>
          {editingReply && (
            <div className="space-y-4">
              <Textarea
                value={editingReply.reply.content}
                onChange={(e) => setEditingReply({
                  ...editingReply,
                  reply: { ...editingReply.reply, content: e.target.value }
                })}
                rows={4}
              />
              <div className="flex gap-2">
                <Button onClick={handleUpdateReply}>Save Changes</Button>
                <Button variant="outline" onClick={() => setEditingReply(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Post Confirmation */}
      <AlertDialog open={!!deletingPost} onOpenChange={(open) => !open && setDeletingPost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone and will also delete all replies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePost} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Reply Confirmation */}
      <AlertDialog open={!!deletingReply} onOpenChange={(open) => !open && setDeletingReply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reply</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reply? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReply} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Discussion</DialogTitle>
            <DialogDescription>
              Copy the link below to share this discussion
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="text-sm" />
              <Button size="icon" variant="outline" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with this link can view this discussion
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
