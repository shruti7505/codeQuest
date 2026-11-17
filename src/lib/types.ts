export type Member = {
  id: string;
  name: string;
  handle: string;
  headline: string;
  bio: string;
  avatar: number;
  reputation: number;
  plan: string;
  locale: string;
  isAdmin: boolean;
  email?: string | null;
  phone?: string | null;
  subscriptionStatus?: string;
  following?: boolean;
};

export type Post = {
  id: number;
  type: string;
  title: string;
  body: string;
  code: string;
  imageUrl: string;
  tags: string[];
  views: number;
  createdAt: string;
  updatedAt: string;
  author: Member;
  likes: number;
  commentCount: number;
  vote: number;
  bookmarked: boolean;
  following: boolean;
  acceptedCommentId: number | null;
  closed: boolean;
  closeVoteCount: number;
  closeVoted: boolean;
};

export type Comment = {
  id: number;
  postId: number;
  parentId: number | null;
  body: string;
  createdAt: string;
  author: Member;
  score: number;
  vote: number;
};

export type AppNotification = {
  id: number;
  message: string;
  postId: number | null;
  read: boolean;
  createdAt: string;
  actor: Member | null;
};

export type Activity = { id: number; delta: number; reason: string; createdAt: string };
